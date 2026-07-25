import type {
  BrowserVoiceAdapter,
  ConfirmedVoiceTranscript,
  TranscriptConfirmationInput,
  UnverifiedVoiceTranscript,
  VoiceCapability,
  VoiceCaptureController,
  VoiceCaptureListener,
  VoiceCaptureState,
} from './types';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

interface SpeechRecognitionWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

const unresolvedReason =
  'Voice transcript requires user review and confirmation before it can be recorded or shared.' as const;

function getRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const browserWindow = window as unknown as SpeechRecognitionWindow;
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
}

function createTranscript(text: string): UnverifiedVoiceTranscript {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `voice-${Date.now()}`,
    text,
    capturedAt: new Date().toISOString(),
    verificationStatus: 'unverified',
    unresolvedReason,
  };
}

function unavailableCapability(reason: string): VoiceCapability {
  return {
    status: 'unavailable',
    reason,
    requiresUserInitiation: true,
    transcriptStorage: 'local_memory',
  };
}

/**
 * Creates an adapter that keeps recognition text in browser memory only. It
 * does not call an application API or include credentials. Browser speech
 * engines can have their own processing policies, so applications should make
 * that clear when offering this optional capability.
 */
export function createBrowserVoiceAdapter(language = 'en-GB'): BrowserVoiceAdapter {
  const Recognition = getRecognitionConstructor();
  const capability: VoiceCapability = Recognition
    ? {
        status: 'available',
        requiresUserInitiation: true,
        transcriptStorage: 'local_memory',
      }
    : unavailableCapability('Speech recognition is not available in this browser.');

  return {
    capability,
    startCaptureFromUserGesture(listener: VoiceCaptureListener): VoiceCaptureController | null {
      if (!Recognition) {
        listener.onUpdate({ state: 'error', error: capability.reason });
        return null;
      }

      const recognition = new Recognition();
      let state: VoiceCaptureState = 'idle';
      let finalText = '';

      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = language;

      const publish = (nextState: VoiceCaptureState, error?: string): void => {
        state = nextState;
        const text = finalText.trim();
        listener.onUpdate({
          state,
          ...(text ? { transcript: createTranscript(text) } : {}),
          ...(error ? { error } : {}),
        });
      };

      recognition.onresult = (event): void => {
        let interimText = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result[0]?.transcript?.trim();
          if (!text) continue;
          if (result.isFinal) {
            finalText = `${finalText} ${text}`.trim();
          } else {
            interimText = `${interimText} ${text}`.trim();
          }
        }

        const displayText = `${finalText} ${interimText}`.trim();
        if (displayText) {
          listener.onUpdate({ state: 'listening', transcript: createTranscript(displayText) });
        }
      };

      recognition.onerror = (event): void => {
        publish('error', `Speech recognition error: ${event.error}`);
      };

      recognition.onend = (): void => {
        if (state !== 'error') {
          publish('stopped');
        }
      };

      const controller: VoiceCaptureController = {
        get state(): VoiceCaptureState {
          return state;
        },
        stop(): void {
          if (state === 'listening') {
            recognition.stop();
          }
        },
      };

      try {
        // This is intentionally the first point where microphone capture can begin.
        // Callers must invoke this method from their user-gesture handler.
        recognition.start();
        publish('listening');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to start speech recognition.';
        publish('error', message);
      }

      return controller;
    },
  };
}

/** Explicitly confirms a reviewed transcript; it does not create a CareEvent or share anything. */
export function confirmVoiceTranscript(
  transcript: UnverifiedVoiceTranscript,
  input: TranscriptConfirmationInput,
): ConfirmedVoiceTranscript {
  const confirmedBy = input.confirmedBy.trim();
  if (!confirmedBy) {
    throw new Error('A reviewer name is required to confirm a voice transcript.');
  }

  return {
    ...transcript,
    verificationStatus: 'confirmed',
    confirmedBy,
    confirmedAt: input.confirmedAt ?? new Date().toISOString(),
  };
}

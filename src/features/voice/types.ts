/**
 * Browser-only voice capture contracts. A transcript is not a CareEvent and
 * must never be treated as a handover claim until a person has reviewed it
 * and it has been recorded as a source event by the owning application.
 */
export type VoiceCapabilityStatus = 'available' | 'unavailable';
export type VoiceCaptureState = 'idle' | 'listening' | 'stopped' | 'error';
export type TranscriptVerificationStatus = 'unverified' | 'confirmed';

export interface VoiceCapability {
  status: VoiceCapabilityStatus;
  /** Web Speech recognition availability in this browser, not microphone permission. */
  reason?: string;
  requiresUserInitiation: true;
  transcriptStorage: 'local_memory';
}

/**
 * Local, unverified text returned by browser speech recognition. It has no
 * source event ID and cannot be used to make or support a generated claim.
 */
export interface UnverifiedVoiceTranscript {
  id: string;
  text: string;
  capturedAt: string;
  verificationStatus: 'unverified';
  unresolvedReason: 'Voice transcript requires user review and confirmation before it can be recorded or shared.';
}

export interface ConfirmedVoiceTranscript extends Omit<UnverifiedVoiceTranscript, 'verificationStatus'> {
  verificationStatus: 'confirmed';
  confirmedBy: string;
  confirmedAt: string;
}

export type VoiceTranscript = UnverifiedVoiceTranscript | ConfirmedVoiceTranscript;

export interface VoiceCaptureUpdate {
  state: VoiceCaptureState;
  /** Present only when recognition produced local text. Always unverified. */
  transcript?: UnverifiedVoiceTranscript;
  error?: string;
}

export interface VoiceCaptureListener {
  onUpdate(update: VoiceCaptureUpdate): void;
}

export interface VoiceCaptureController {
  readonly state: VoiceCaptureState;
  stop(): void;
}

export interface BrowserVoiceAdapter {
  readonly capability: VoiceCapability;
  /**
   * Call directly from an explicit user gesture (for example, a button click).
   * Constructing the adapter never starts microphone capture.
   */
  startCaptureFromUserGesture(listener: VoiceCaptureListener): VoiceCaptureController | null;
}

export interface TranscriptConfirmationInput {
  confirmedBy: string;
  confirmedAt?: string;
}

export type LiveKitProfileUser = {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  avatar?: string | null;
};

export type LiveKitParticipantMetadata = {
  avatarUrl?: string;
  selectedTaskId?: string;
  selectedTaskTitle?: string;
  selectedTaskProgress?: number;
};

export function buildParticipantDisplayName(user: LiveKitProfileUser): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  return user.email;
}

export function buildParticipantMetadata(user: LiveKitProfileUser): string {
  const metadata: LiveKitParticipantMetadata = {};
  if (user.avatar) {
    metadata.avatarUrl = user.avatar;
  }
  return JSON.stringify(metadata);
}

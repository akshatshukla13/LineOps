import { nowDateString, previousDateString } from '../utils/helpers.js';

export const canEditEntry = (user, entry) => {
  if (user.role === 'admin') return true;
  if (entry.status === 'locked') return false;

  const today = nowDateString();
  const yesterday = previousDateString();

  if (user.role === 'operator') {
    return String(entry.createdBy) === String(user._id) && entry.date === today;
  }

  if (user.role === 'supervisor') {
    const inDateWindow = entry.date === today || entry.date === yesterday;
    const lineMatch =
      !user.assignedLines?.length ||
      user.assignedLines.some((lineId) => String(lineId) === String(entry.lineId));
    return inDateWindow && lineMatch;
  }

  return false;
};

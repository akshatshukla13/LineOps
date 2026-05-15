export const emptyEntry = () => ({
  date: new Date().toISOString().slice(0, 10),
  shiftId: '',
  lineId: '',
  machineId: '',
  processId: '',
  operatorId: '',
  plannedQty: 0,
  hourlyInputs: Array(12).fill(0),
  rejectQty: 0,
  reworkQty: 0,
  downtimeMinutes: 0,
  downtimeOtherText: '',
  remarks: '',
  status: 'draft',
});

export const resolveMasterId = (value) => {
  if (value == null || value === '') return '';
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

export const getParentName = (masters, parentKind, parentId) => {
  if (!parentId || !parentKind) return '-';
  const parent = (masters[parentKind] || []).find((item) => item._id === parentId);
  return parent ? `${parent.name} (${parent.code || 'N/A'})` : '-';
};

export const optionsByKind = (masters, kind) => masters[kind] || [];

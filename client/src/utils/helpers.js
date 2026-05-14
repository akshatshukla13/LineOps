export const emptyEntry = () => ({
  date: new Date().toISOString().slice(0, 10),
  shiftId: '',
  departmentId: '',
  lineId: '',
  machineId: '',
  processId: '',
  operatorId: '',
  productId: '',
  plannedQty: 0,
  hourlyInputs: Array(12).fill(0),
  rejectQty: 0,
  reworkQty: 0,
  downtimeMinutes: 0,
  downtimeReasonId: '',
  downtimeOtherText: '',
  remarks: '',
  status: 'draft',
});

export const getParentName = (masters, parentKind, parentId) => {
  if (!parentId || !parentKind) return '-';
  const parent = (masters[parentKind] || []).find((item) => item._id === parentId);
  return parent ? `${parent.name} (${parent.code || 'N/A'})` : '-';
};

export const optionsByKind = (masters, kind) => masters[kind] || [];

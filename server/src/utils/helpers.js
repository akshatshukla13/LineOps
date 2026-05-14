export const nowDateString = () => 
  new Date().toISOString().slice(0, 10);

export const previousDateString = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
};

export const normalizeHourlyInputs = (values = []) => {
  return [...values.map((n) => Number(n || 0)), ...Array(12).fill(0)].slice(0, 12);
};

export const calculateMetrics = (entry) => {
  const totalProduction = (entry.hourlyInputs || []).reduce((sum, n) => sum + Number(n || 0), 0);
  const netProduction = Math.max(
    totalProduction - Number(entry.rejectQty || 0) - Number(entry.reworkQty || 0),
    0
  );
  const target = Number(entry.plannedQty || 0);
  const efficiencyPct = target > 0 ? (netProduction / target) * 100 : 0;
  const lossPct = target > 0 ? ((target - netProduction) / target) * 100 : 0;
  const downtimePct = 720 > 0 ? (Number(entry.downtimeMinutes || 0) / 720) * 100 : 0;
  
  return {
    totalProduction,
    netProduction,
    efficiencyPct: Number(efficiencyPct.toFixed(2)),
    lossPct: Number(lossPct.toFixed(2)),
    downtimePct: Number(downtimePct.toFixed(2)),
  };
};

export const sanitizeUser = (user) => ({
  id: user._id,
  fullName: user.fullName,
  employeeId: user.employeeId,
  username: user.username,
  role: user.role,
  assignedDepartment: user.assignedDepartment,
  assignedLines: user.assignedLines,
  status: user.status,
});

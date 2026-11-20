export function getRenewalInfo(renewalDate) {
  if (!renewalDate) {
    return {
      reminderDate: null,
      daysRemaining: null,
      status: 'No Renewal Date',
      shouldRemind: false,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const renewal = new Date(`${renewalDate}T00:00:00`);
  const reminder = new Date(renewal);

  reminder.setDate(reminder.getDate() - 30);

  const daysRemaining = Math.ceil(
    (renewal - today) / (1000 * 60 * 60 * 24)
  );

  const shouldRemind =
    today >= reminder && daysRemaining >= 0;

  let status = 'Active';

  if (daysRemaining < 0) {
    status = 'Overdue';
  } else if (daysRemaining <= 30) {
    status = 'Due Soon';
  }

  return {
    reminderDate: reminder.toISOString().split('T')[0],
    daysRemaining,
    status,
    shouldRemind,
  };
}
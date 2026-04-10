import { format, parseISO } from 'date-fns';

export const safeFormatDate = (dateStr: string | undefined, formatStr: string = 'dd/MM/yy') => {
  if (!dateStr) return '--/--/--';
  try {
    return format(parseISO(dateStr), formatStr);
  } catch (e) {
    return '--/--/--';
  }
};

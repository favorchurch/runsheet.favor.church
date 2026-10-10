export const RUNSHEET_ERROR_STATUS_MAP: Readonly<Record<string, number>> = {
  'Invalid runsheet.': 400,
  'Runsheet not found.': 404,
  'You do not have access to this runsheet.': 403,
  'You do not have access to runsheets.': 403,
};

export const PDF_GENERATION_ERROR_MESSAGE = 'Failed to generate PDF';

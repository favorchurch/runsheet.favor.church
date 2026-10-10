export const RUNSHEET_ERROR_STATUS_MAP: Readonly<Record<string, number>> = {
  'Invalid runsheet.': 400,
  'Runsheet not found.': 404,
  'You do not have access to this runsheet.': 403,
  'You do not have access to runsheets.': 403,
};

export const UNEXPECTED_ERROR_MESSAGE = 'An unexpected error occurred while generating the runsheet PDF.';

import { createTheme } from '@mantine/core';

import { primarySegmentedControl, regularWeightControls } from './controlTypography';
import { sage } from './sage';

/** The original look: teal on Mantine's defaults, system fonts. */
export const classicTheme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'md',
  colors: { sage },
  components: {
    ...regularWeightControls,
    ...primarySegmentedControl('teal'),
  },
});

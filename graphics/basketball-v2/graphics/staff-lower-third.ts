import { StaffId } from '@dtv/domain';
import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { fullName, staffOf } from './shared';

export const staffLowerThird = defineGraphic({
  id: 'basketball-v2/staff-lower-third',
  scene: SCENES.staff_lower_third,
  params: z.object({ staff: StaffId }),
})({
  name: 'Staff Lower Third',
  sport: 'basketball',
  layer: 'lower',
  demo: { staff: 'drexel-mbb@2026-27/spiker-zach' },
  site: 'with-scorebug',
  label: (params, context) => {
    const { staff } = staffOf(context.world, params.staff);
    return `${fullName(staff)} · ${staff.title}`;
  },
  bind(params, context) {
    const { staff, team } = staffOf(context.world, params.staff);
    return {
      firstName: staff.firstName,
      lastName: staff.lastName,
      title: staff.title,
      detail: staff.detail,
      teamLogo: team.brand.logo,
      teamPrimaryColor: team.brand.primaryColor,
      teamSecondaryColor: team.brand.secondaryColor,
    };
  },
});

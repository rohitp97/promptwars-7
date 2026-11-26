import type { Household } from '../types'

/**
 * Sample households: one-click starting points for evaluators, sample text for the AI intake, and
 * the fixtures the tests run against. Each one must survive sanitizeHousehold() unchanged.
 */
export interface Preset {
  id: string
  title: string
  blurb: string
  /** Text an evaluator can paste into "Describe your household" to test the AI intake. */
  sampleText: string
  household: Household
}

/** Sample households: the evaluator's one-click starting points (and the test fixtures). */
export const PRESETS: readonly Preset[] = [
  {
    id: 'delhi-family',
    title: 'Family with kids and a grandparent',
    blurb: 'Two school-age children, grandmother with asthma, a parent who drives 18 km to work.',
    sampleText:
      'We are five. I drive my petrol car 18 km to Gurgaon at 8:30 and back, five days a week. My wife works from home and takes a 30 minute evening walk at 6. Our kids are 8 and 11, they play cricket downstairs from 5 to 6. My mother is 68 and has asthma, she walks in the park at 7 in the morning. We use agarbatti every morning and cook on gas. Bedroom is about 150 sq ft with a small purifier.',
    household: {
      members: [
        {
          id: 'm-papa',
          name: 'Rahul',
          age: 'adult',
          conditions: [],
          mask: 'none',
          activities: [
            {
              id: 'a-commute',
              kind: 'commute',
              label: 'Drive to office',
              hour: 8,
              minutes: 50,
              effort: 'rest',
              flexible: true,
              mode: 'car_petrol',
              km: 18,
              tripsPerWeek: 5,
            },
          ],
        },
        {
          id: 'm-mummy',
          name: 'Neha',
          age: 'adult',
          conditions: [],
          mask: 'surgical',
          activities: [
            {
              id: 'a-walk',
              kind: 'walk',
              label: 'Evening walk',
              hour: 18,
              minutes: 30,
              effort: 'light',
              flexible: true,
            },
          ],
        },
        {
          id: 'm-kid1',
          name: 'Aarav',
          age: 'child',
          conditions: [],
          mask: 'none',
          activities: [
            {
              id: 'a-cricket',
              kind: 'outdoor_play',
              label: 'Cricket downstairs',
              hour: 17,
              minutes: 60,
              effort: 'vigorous',
              flexible: true,
            },
          ],
        },
        {
          id: 'm-kid2',
          name: 'Myra',
          age: 'child',
          conditions: [],
          mask: 'none',
          activities: [
            {
              id: 'a-play2',
              kind: 'outdoor_play',
              label: 'Play in the park',
              hour: 17,
              minutes: 60,
              effort: 'vigorous',
              flexible: true,
            },
          ],
        },
        {
          id: 'm-dadi',
          name: 'Dadi',
          age: 'elder',
          conditions: ['asthma'],
          mask: 'cloth',
          activities: [
            {
              id: 'a-morning',
              kind: 'walk',
              label: 'Morning park walk',
              hour: 7,
              minutes: 40,
              effort: 'light',
              flexible: true,
            },
          ],
        },
      ],
      home: {
        rooms: [
          { id: 'r-bed', name: 'Bedroom', areaSqft: 150, heightFt: 10, purifierCadr: 150 },
          { id: 'r-living', name: 'Living room', areaSqft: 250, heightFt: 10, purifierCadr: 0 },
        ],
        sources: ['incense', 'gas_stove'],
        leakiness: 'average',
      },
    },
  },
  {
    id: 'solo-commuter',
    title: 'Young professional, two-wheeler',
    blurb: 'Rides 12 km each way, runs in the morning, lives in a 1BHK with no purifier.',
    sampleText:
      "I'm 27, live alone in a 1BHK. I ride my scooter 12 km to office at 9:30, six days a week, with a cloth mask. I go for a 45 minute run at 6:30 am. No air purifier, I use a mosquito coil at night.",
    household: {
      members: [
        {
          id: 'm-solo',
          name: 'Priya',
          age: 'adult',
          conditions: [],
          mask: 'cloth',
          activities: [
            {
              id: 'a-ride',
              kind: 'commute',
              label: 'Scooter to office',
              hour: 9,
              minutes: 30,
              effort: 'light',
              flexible: false,
              mode: 'two_wheeler',
              km: 12,
              tripsPerWeek: 6,
            },
            {
              id: 'a-run',
              kind: 'exercise',
              label: 'Morning run',
              hour: 6,
              minutes: 45,
              effort: 'vigorous',
              flexible: true,
            },
          ],
        },
      ],
      home: {
        rooms: [{ id: 'r-1bhk', name: 'Bedroom-cum-living', areaSqft: 220, heightFt: 10, purifierCadr: 0 }],
        sources: ['mosquito_coil', 'gas_stove'],
        leakiness: 'leaky',
      },
    },
  },
  {
    id: 'elder-couple',
    title: 'Retired couple',
    blurb: 'Both over 65, one with a heart condition; morning walk and a market run.',
    sampleText:
      'We are a retired couple, both 67. My husband has a heart condition. We walk in the colony park at 6:30 am for 45 minutes and go to the sabzi market at 10 by auto, 3 km, three times a week.',
    household: {
      members: [
        {
          id: 'm-nana',
          name: 'Suresh',
          age: 'elder',
          conditions: ['heart'],
          mask: 'surgical',
          activities: [
            { id: 'a-w1', kind: 'walk', label: 'Morning walk', hour: 6, minutes: 45, effort: 'light', flexible: true },
          ],
        },
        {
          id: 'm-nani',
          name: 'Kamla',
          age: 'elder',
          conditions: [],
          mask: 'surgical',
          activities: [
            {
              id: 'a-mkt',
              kind: 'errand',
              label: 'Sabzi market',
              hour: 10,
              minutes: 60,
              effort: 'light',
              flexible: true,
              mode: 'auto',
              km: 3,
              tripsPerWeek: 3,
            },
          ],
        },
      ],
      home: {
        rooms: [{ id: 'r-b', name: 'Bedroom', areaSqft: 160, heightFt: 10, purifierCadr: 0 }],
        sources: ['incense', 'gas_stove'],
        leakiness: 'average',
      },
    },
  },
]

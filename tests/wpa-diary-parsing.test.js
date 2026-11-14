const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { extractSwaySections, normalizeYearGroups } = require('../scripts/utils/wpa-sway-parser');

describe('WPA Diary Image Discovery & Year Group Normalization', () => {
  test('extractSwaySections captures diary image URLs from ToC ContentId nodes', () => {
    const mockPayload = {
      StoryDiff: {
        propBags: [{
          type: 'Node-Root',
          children: [
            {
              type: 'Node-ToCElement',
              props: {
                Title: 'Dates for your Diary',
                SubTitle: 'Upcoming events',
                NavigationTargetId: 'diary-sec-1'
              }
            },
            {
              type: 'Node-Group',
              props: { ContentId: 'diary-sec-1' },
              children: [
                {
                  type: 'Node-Image',
                  props: { ImageUrl: 'https://sway.cloud.microsoft/s/KrpY9qDKwz4OUSqB/images/6VWPBp9VEqs_xi' }
                },
                {
                  type: 'Node-Image',
                  props: { ImageUrl: 'https://sway.cloud.microsoft/s/KrpY9qDKwz4OUSqB/images/oxMO53CBpQTYG9' }
                }
              ]
            }
          ]
        }]
      }
    };

    const sections = extractSwaySections(mockPayload);
    assert.strictEqual(sections.length, 1);
    assert.strictEqual(sections[0].title, 'Dates for your Diary');
    assert.deepStrictEqual(sections[0].images, [
      'https://sway.cloud.microsoft/s/KrpY9qDKwz4OUSqB/images/6VWPBp9VEqs_xi',
      'https://sway.cloud.microsoft/s/KrpY9qDKwz4OUSqB/images/oxMO53CBpQTYG9'
    ]);
  });

  test('normalizeYearGroups maps column booleans and raw year labels to canonical codes', () => {
    assert.deepStrictEqual(
      normalizeYearGroups([], { R: false, Y1: false, Y2: false, Y3: false, Y4: true, Y5: false, Y6: false }),
      ['Y4']
    );

    assert.deepStrictEqual(
      normalizeYearGroups(['EYFS', '1', 'Year 2'], null),
      ['R', 'Y1', 'Y2']
    );

    assert.deepStrictEqual(
      normalizeYearGroups([], { R: true, Y1: true, Y2: true, Y3: true, Y4: true, Y5: true, Y6: true }),
      ['All Years']
    );

    assert.deepStrictEqual(
      normalizeYearGroups(['All'], null),
      ['All Years']
    );
  });
});

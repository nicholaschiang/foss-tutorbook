// =============================================================================
// DEPENDENCIES
// =============================================================================

const {
  PROJECT_ID,
  COVERAGE_URL,
  FIRESTORE_RULES,
  USER_SUBCOLLECTIONS,
} = require('./config.js');
const {
  PUPIL,
  TUTOR,
  SUPERVISOR,
  ACCESS,
  ACCESS_ID,
  LOCATION,
  LOCATION_ID,
  ANNOUNCEMENT_GROUP,
  ANNOUNCEMENT_MSG,
  CHAT,
  MESSAGE,
  APPROVED_CLOCK_IN,
  APPROVED_CLOCK_IN_ID,
  REJECTED_CLOCK_IN,
  REJECTED_CLOCK_IN_ID,
  APPROVED_CLOCK_OUT,
  APPROVED_CLOCK_OUT_ID,
  REJECTED_CLOCK_OUT,
  REJECTED_CLOCK_OUT_ID,
} = require('./data.js');

const { combineMaps, authedApp, data } = require('./utils.js');

const firebase = require('@firebase/testing');
const fs = require('fs');

// =============================================================================
// FIRESTORE RULES TESTS
// =============================================================================

beforeEach(async () => {
  // Clear the database simulator between tests.
  await firebase.clearFirestoreData({
    projectId: PROJECT_ID,
  });
});

before(async () => {
  // Load the Firestore rules before testing.
  await firebase.loadFirestoreRules({
    projectId: PROJECT_ID,
    rules: FIRESTORE_RULES,
  });
});

after(async () => {
  // Delete test app instances and log coverage info URL.
  await Promise.all(firebase.apps().map((app) => app.delete()));
  console.log('View rule coverage information at ' + COVERAGE_URL + ' \n');
});

describe("Tutorbook's Database Security", async () => {
  // =========================================================================
  // USERs
  // =========================================================================

  it('requires users to log-in before creating a profile', async () => {
    const db = authedApp();
    const ref = db.collection('users').doc(PUPIL.uid);
    await firebase.assertFails(
      ref.set({
        type: PUPIL.type,
      })
    );
  });

  it('ensures users start w/out hrs, balance, ratings, access', async () => {
    const db = authedApp({
      uid: TUTOR.uid,
      email: TUTOR.email,
    });
    const ref = db.collection('users').doc(TUTOR.uid);
    await firebase.assertFails(
      ref.set({
        type: TUTOR.type,
      })
    );
    await firebase.assertFails(
      ref.set({
        type: TUTOR.type,
        secondsPupiled: 0,
      })
    );
    await firebase.assertFails(
      ref.set({
        type: TUTOR.type,
        secondsTutored: 0,
      })
    );
    await firebase.assertFails(
      ref.set({
        type: TUTOR.type,
        secondsPupiled: 0,
        secondsTutored: 0,
      })
    );
    await firebase.assertFails(
      ref.set({
        type: TUTOR.type,
        payments: {
          currentBalance: 0,
        },
      })
    );
    await firebase.assertFails(
      ref.set({
        type: TUTOR.type,
        payments: {
          currentBalance: 0,
        },
        avgRating: 0,
        numRatings: 0,
      })
    );
    await firebase.assertFails(
      ref.set({
        type: TUTOR.type,
        access: [],
      })
    );
    await firebase.assertSucceeds(
      ref.set({
        type: TUTOR.type,
        payments: {
          currentBalance: 0,
        },
        secondsPupiled: 0,
        secondsTutored: 0,
        avgRating: 0,
        numRatings: 0,
        access: [],
      })
    );
    await firebase.assertSucceeds(
      ref.set({
        type: TUTOR.type,
        payments: {
          currentBalance: 0,
        },
        secondsPupiled: 0,
        secondsTutored: 0,
        avgRating: 0,
        numRatings: 0,
        access: ['root'],
      })
    );
  });

  function createProfile(profile) {
    const state = {};
    state['users/' + profile.uid] = profile;
    return data(state);
  }

  function createLocation() {
    const state = {};
    state['locations/' + LOCATION_ID] = LOCATION;
    return data(state);
  }

  function createApprovedClockIn() {
    const state = {};
    state[
      'locations/' + LOCATION_ID + '/approvedClockIns/' + APPROVED_CLOCK_IN_ID
    ] = APPROVED_CLOCK_IN;
    return data(state);
  }

  function createRejectedClockIn() {
    const state = {};
    state[
      'locations/' + LOCATION_ID + '/rejectedClockIns/' + REJECTED_CLOCK_IN_ID
    ] = REJECTED_CLOCK_IN;
    return data(state);
  }

  function createApprovedClockOut() {
    const state = {};
    state[
      'locations/' + LOCATION_ID + '/approvedClockOuts/' + APPROVED_CLOCK_OUT_ID
    ] = APPROVED_CLOCK_OUT;
    return data(state);
  }

  function createRejectedClockOut() {
    const state = {};
    state[
      'locations/' + LOCATION_ID + '/rejectedClockOuts/' + REJECTED_CLOCK_OUT_ID
    ] = REJECTED_CLOCK_OUT;
    return data(state);
  }

  it('prevents users from changing their access/district', async () => {
    await createProfile(TUTOR);
    const db = authedApp({
      uid: TUTOR.uid,
      email: TUTOR.email,
    });
    const ref = db.collection('users').doc(TUTOR.uid);
    await firebase.assertFails(
      ref.update({
        access: [ACCESS_ID, ACCESS_ID, ACCESS_ID],
      })
    );
  });

  it('prevents users from changing their num of ratings', async () => {
    await createProfile(TUTOR);
    const db = authedApp({
      uid: TUTOR.uid,
      email: TUTOR.email,
    });
    const ref = db.collection('users').doc(TUTOR.uid);
    await firebase.assertFails(
      ref.update({
        numRatings: 10,
      })
    );
  });

  it('prevents users from changing their avg rating', async () => {
    await createProfile(TUTOR);
    const db = authedApp({
      uid: TUTOR.uid,
      email: TUTOR.email,
    });
    const ref = db.collection('users').doc(TUTOR.uid);
    await firebase.assertFails(
      ref.update({
        avgRating: 5,
      })
    );
  });

  it('prevents (free) tutors from changing their service hrs', async () => {
    await createProfile(TUTOR);
    const db = authedApp({
      uid: TUTOR.uid,
      email: TUTOR.email,
    });
    const ref = db.collection('users').doc(TUTOR.uid);
    await firebase.assertFails(
      ref.update({
        secondsTutored: 2400,
      })
    );
  });

  it('prevents (paid) tutors from changing their balance', async () => {
    await createProfile(TUTOR);
    const db = authedApp({
      uid: TUTOR.uid,
      email: TUTOR.email,
    });
    const ref = db.collection('users').doc(TUTOR.uid);
    await firebase.assertFails(
      ref.update({
        payments: {
          currentBalance: 200,
        },
      })
    );
  });

  it('only lets users create their own profiles', async () => {
    const db = authedApp({
      uid: PUPIL.uid,
      email: PUPIL.email,
    });
    const pupil = db.collection('users').doc(PUPIL.uid);
    await firebase.assertSucceeds(
      pupil.set({
        type: PUPIL.type,
        payments: {
          currentBalance: 0,
          currentBalanceString: '$0.00',
        },
        secondsPupiled: 0,
        secondsTutored: 0,
        numRatings: 0,
        avgRating: 0,
        access: [],
      })
    );
    const tutor = db.collection('users').doc(TUTOR.uid);
    await firebase.assertFails(
      tutor.set({
        type: TUTOR.type,
        payments: {
          currentBalance: 0,
          currentBalanceString: '$0.00',
        },
        secondsPupiled: 0,
        secondsTutored: 0,
        numRatings: 0,
        avgRating: 0,
        access: [],
      })
    );
  });

  it('lets users read profiles in their access/district', async () => {
    const db = authedApp({
      uid: PUPIL.uid,
      email: PUPIL.email,
      access: PUPIL.access,
    });
    const ref = db.collection('users').doc(TUTOR.uid);
    await createProfile(TUTOR);
    await firebase.assertSucceeds(ref.get());
  });

  it('lets users list profiles in their access/district', async () => {
    const db = authedApp({
      uid: PUPIL.uid,
      email: PUPIL.email,
      access: PUPIL.access,
    });
    const query = db
      .collection('users')
      .where('access', 'array-contains-any', PUPIL.access);
    await firebase.assertSucceeds(query.get());
  });

  it('lets users list profiles they proxy for', async () => {
    const db = authedApp({
      uid: SUPERVISOR.uid,
      email: SUPERVISOR.email,
    });
    const query = db
      .collection('users')
      .where('proxy', 'array-contains', SUPERVISOR.uid);
    await firebase.assertSucceeds(query.get());
  });

  it('lets users read profiles they proxy for', async () => {
    const db = authedApp({
      uid: SUPERVISOR.uid,
      email: SUPERVISOR.email,
    });
    const ref = db.collection('users').doc(TUTOR.uid);
    await createProfile(
      combineMaps(TUTOR, {
        proxy: [SUPERVISOR.uid],
      })
    );
    await firebase.assertSucceeds(ref.get());
  });

  it('contains users within their access/district', async () => {
    const db = authedApp({
      uid: PUPIL.uid,
      email: PUPIL.email,
      access: PUPIL.access,
    });
    const ref = db.collection('users').doc(TUTOR.uid);
    await createProfile(
      combineMaps(TUTOR, {
        access: [],
      })
    );
    await firebase.assertFails(ref.get());
  });

  // =========================================================================
  // SUBCOLLECTIONs (requests, appointments, etc)
  // =========================================================================

  USER_SUBCOLLECTIONS.forEach((subcollection) => {
    it('lets users read their ' + subcollection, () => {
      const db = authedApp({
        uid: TUTOR.uid,
        email: TUTOR.email,
      });
      const ref = db.collection('users').doc(TUTOR.uid);
      return firebase.assertSucceeds(ref.collection(subcollection).get());
    });
    it('only lets users read their own ' + subcollection, async () => {
      const db = authedApp({
        uid: TUTOR.uid,
        email: TUTOR.email,
      });
      await createProfile(PUPIL);
      const ref = db.collection('users').doc(PUPIL.uid);
      return firebase.assertFails(ref.collection(subcollection).get());
    });
    it("lets users read their proxy's " + subcollection, async () => {
      const db = authedApp({
        uid: TUTOR.uid,
        email: TUTOR.email,
      });
      await createProfile(
        combineMaps(PUPIL, {
          proxy: [TUTOR.uid],
        })
      );
      const ref = db.collection('users').doc(PUPIL.uid);
      return firebase.assertSucceeds(ref.collection(subcollection).get());
    });
  });

  // =========================================================================
  // CHATs (announcements, messages, etc)
  // =========================================================================

  it('lets supervisors send announcements', async () => {
    await createLocation();
    const db = authedApp({
      uid: SUPERVISOR.uid,
      email: SUPERVISOR.email,
      locations: [LOCATION_ID],
      supervisor: true,
    });
    const location = db.collection('locations').doc(LOCATION_ID);
    const group = location.collection('announcements').doc();
    const msg = group.collection('messages').doc();
    await firebase.assertSucceeds(group.set(ANNOUNCEMENT_GROUP));
    await firebase.assertSucceeds(msg.set(ANNOUNCEMENT_MSG));
  });

  it('lets users send messages', async () => {
    const db = authedApp({
      uid: PUPIL.uid,
      email: PUPIL.email,
    });
    const chat = db.collection('chats').doc();
    const msg = chat.collection('messages').doc();
    await firebase.assertSucceeds(chat.set(CHAT));
    await firebase.assertSucceeds(msg.set(MESSAGE));
  });

  // =========================================================================
  // TODO: LOCATIONs (clock-ins, clock-outs, appointments, etc)
  // =========================================================================

  it("lets supervisors read their location's clock-ins", async () => {
    await createLocation();
    const db = authedApp({
      uid: SUPERVISOR.uid,
      supervisor: true,
      locations: [LOCATION_ID],
    });
    const query = db
      .collection('locations')
      .doc(LOCATION_ID)
      .collection('clockIns');
    await firebase.assertSucceeds(query.get());
  });

  it("lets supervisors read their location's clock-outs", async () => {
    await createLocation();
    const db = authedApp({
      uid: SUPERVISOR.uid,
      supervisor: true,
      locations: [LOCATION_ID],
    });
    const query = db
      .collection('locations')
      .doc(LOCATION_ID)
      .collection('clockOuts');
    await firebase.assertSucceeds(query.get());
  });

  it("only lets supervisors read their location's clock-ins", async () => {
    await createLocation();
    const db = authedApp({
      uid: SUPERVISOR.uid,
      supervisor: true,
      locations: [],
    });
    const query = db
      .collection('locations')
      .doc(LOCATION_ID)
      .collection('clockIns');
    await firebase.assertFails(query.get());
  });

  it("only lets supervisors read their location's clock-outs", async () => {
    await createLocation();
    const db = authedApp({
      uid: SUPERVISOR.uid,
      supervisor: true,
      locations: [],
    });
    const query = db
      .collection('locations')
      .doc(LOCATION_ID)
      .collection('clockOuts');
    await firebase.assertFails(query.get());
  });

  it('lets users read their approved clock-in requests', async () => {
    await createApprovedClockIn();
    const db = authedApp({
      uid: TUTOR.uid,
    });
    const ref = db
      .collection('locations')
      .doc(LOCATION_ID)
      .collection('approvedClockIns')
      .doc(APPROVED_CLOCK_IN_ID);
    await firebase.assertSucceeds(ref.get());
  });

  it('lets users read their rejected clock-in requests', async () => {
    await createRejectedClockIn();
    const db = authedApp({
      uid: TUTOR.uid,
    });
    const ref = db
      .collection('locations')
      .doc(LOCATION_ID)
      .collection('rejectedClockIns')
      .doc(REJECTED_CLOCK_IN_ID);
    await firebase.assertSucceeds(ref.get());
  });

  it('lets users read their approved clock-out requests', async () => {
    await createApprovedClockOut();
    const db = authedApp({
      uid: TUTOR.uid,
    });
    const ref = db
      .collection('locations')
      .doc(LOCATION_ID)
      .collection('approvedClockOuts')
      .doc(APPROVED_CLOCK_OUT_ID);
    await firebase.assertSucceeds(ref.get());
  });

  it('lets users read their rejected clock-out requests', async () => {
    await createRejectedClockOut();
    const db = authedApp({
      uid: TUTOR.uid,
    });
    const ref = db
      .collection('locations')
      .doc(LOCATION_ID)
      .collection('rejectedClockOuts')
      .doc(REJECTED_CLOCK_OUT_ID);
    await firebase.assertSucceeds(ref.get());
  });

  it('only lets users read their own approved clock-in requests', () => {
    const db = authedApp({
      uid: TUTOR.uid,
    });
    const ref = db
      .collection('locations')
      .doc(LOCATION_ID)
      .collection('approvedClockIns')
      .doc(APPROVED_CLOCK_IN_ID);
    return firebase.assertFails(ref.get());
  });

  it('only lets users read their own rejected clock-in requests', () => {
    const db = authedApp({
      uid: TUTOR.uid,
    });
    const ref = db
      .collection('locations')
      .doc(LOCATION_ID)
      .collection('rejectedClockIns')
      .doc(REJECTED_CLOCK_IN_ID);
    return firebase.assertFails(ref.get());
  });

  it('only lets users read their own approved clock-out requests', () => {
    const db = authedApp({
      uid: TUTOR.uid,
    });
    const ref = db
      .collection('locations')
      .doc(LOCATION_ID)
      .collection('approvedClockOuts')
      .doc(APPROVED_CLOCK_OUT_ID);
    return firebase.assertFails(ref.get());
  });

  it('only lets users read their own rejected clock-out requests', () => {
    const db = authedApp({
      uid: TUTOR.uid,
    });
    const ref = db
      .collection('locations')
      .doc(LOCATION_ID)
      .collection('rejectedClockOuts')
      .doc(REJECTED_CLOCK_OUT_ID);
    return firebase.assertFails(ref.get());
  });
});

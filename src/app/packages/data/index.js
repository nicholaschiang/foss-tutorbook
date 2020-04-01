/**
 * Package that contains a wrapper for our data REST API (and other common data
 * actions; such as updating a user's Firestore profile document directly).
 * @module @tutorbook/data
 * @see {@link https://npmjs.com/package/@tutorbook/data}
 *
 * @license
 * Copyright (C) 2020 Tutorbook
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more
 * details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import to from 'await-to-js';
import axios from 'axios';
import algoliasearch from 'algoliasearch';

import * as firebase from 'firebase/app';
import 'firebase/auth';

/**
 * Class that manages Firestore data flow along with any local app data.
 * @todo Add documentation (`@memberof`) links to static attributes (e.g.
 * `Data.grades` doesn't point to anything right now but we know it exists).
 */
export default class Data {
  /**
   * Creates a new Data object that manages Firestore data flow for the
   * Tutorbook web app.
   * @param {external:CollectionReference} [db=window.app.db] - The Firestore
   * partition to fetch data from.
   * @param {bool} [init=true] - Whether or not to initialize locations,
   * grades, periods, times, hourlyCharges, etc.
   */
  constructor() {
    this.db = window.app.db;
    this.initialization = this.init();
  }

  /**
   * Initializes locally stored locations, grades, periods, times, and
   * hourlyCharges.
   * @param {Object} [config=window.app.config] - The website configuration to
   * pull grades and subjects from.
   * @param {Object[]} [locations=window.app.locations] - The array of
   * locations to sync this data object with.
   */
  async init() {
    this.initTimes();
    this.initHourlyCharges();
    await this.initLocations();
    this.initPeriods();
    this.initGrades();
  }

  /**
   * Creates and syncs location data from the web app configuration.
   * @param {Object[]} [locations=window.app.locations] - The array of
   * locations to sync this data object with.
   */
  async initLocations() {
    this.locations = window.app.locations = [];
    await this.getLocations();
    this.locationsByName = {};
    this.locationsByID = {};
    this.locationDataByName = {};
    this.locationDataByID = {};
    this.locationNames = [];
    this.locationIDs = [];
    this.locations.forEach((location) => {
      this.locationsByName[location.name] = location.id;
      this.locationDataByName[location.name] = location;
      this.locationsByID[location.id] = location.name;
      this.locationDataByID[location.id] = location;
      this.locationNames.push(location.name);
      this.locationIDs.push(location.id);
    });
  }

  /**
   * Fetches and syncs local app data with locations specified in given
   * website configuration.
   * @todo Store dialogs and other views dependent on this local location or
   * configuration data in order to recreate them when that location or
   * configuration data changes (i.e. so one doesn't have to reload the web
   * app in order to see changes).
   * @todo Remove dependencies to `window.app.location` and point them instead
   * to `window.app.data.location` or `window.app.data.locations[0]`.
   * @todo Remove redundant fetches of Firestore data when in root partition.
   * @return {Promise} Promise that resolves once the locations have been
   * successfully fetched and synced with `this.locations`.
   */
  async getLocations() {
    var locationIds = window.app.config.locations;
    if (!locationIds.length)
      locationIds = (
        await window.app.db.collection('locations').get()
      ).docs.map((doc) => doc.id);
    return Promise.all(
      locationIds.map((locationId) =>
        Data.listen(
          ['locations', locationId],
          (doc) => {
            const locationData = Data.combineMaps(doc.data(), {
              id: doc.id,
            });
            const index = this.locations.findIndex((l) => l.id === doc.id);
            if (index < 0) {
              this.locations.push(locationData);
            } else {
              this.locations[index] = locationData;
            }
            this.location = window.app.location = this.locations[0];
          },
          (error) => {
            console.error(
              '[ERROR] Could not get website configuration (' +
                window.app.id +
                ') location (' +
                locationId +
                ').'
            );
          },
          {
            db: window.app.db,
            listeners: window.app.listeners,
          }
        )
      )
    );
  }

  /**
   * Syncs grades with the web app configuration (or all of the
   * [statically defined grades]{@linkplain Data.grades}).
   * @param {string[]} [grades=window.app.config.grades] - The array of grades
   * to sync this data object with.
   */
  initGrades() {
    this.grades = window.app.config.grades || Data.grades;
  }

  /**
   * Uses web app location data to add periods to local data.
   * @param {Object[]} [locations=window.app.locations] - The array of
   * locations to get periods from.
   */
  initPeriods() {
    const times = {};
    this.locations.forEach((location) => {
      Object.entries(location.hours).forEach(([d, a]) =>
        a.forEach((s) => {
          if (!times[d]) times[d] = [];
          if (times[d].indexOf(s.open) < 0) times[d].push(s.open);
          if (times[d].indexOf(s.close) < 0) times[d].push(s.close);
        })
      );
    });
    this.periods = {};
    Object.entries(times).forEach(([day, times]) => {
      if (!this.periods[day]) this.periods[day] = [];
      times.forEach((time) => {
        if (this.timeStrings.indexOf(time) < 0) this.periods[day].push(time);
      });
    });
  }

  /**
   * Creates the `timeStrings` array for this data object (every minute
   * formatted like 3:45 PM).
   */
  initTimes() {
    // First, iterate over 'AM' vs 'PM'
    this.timeStrings = [];
    ['AM', 'PM'].forEach((suffix) => {
      // NOTE: 12:00 AM and 12:00 PM are wierd (as they occur after the
      // opposite suffix) so we have to append them differently
      for (var min = 0; min < 60; min++) {
        // Add an extra zero for values less then 10
        if (min < 10) {
          var minString = '0' + min.toString();
        } else {
          var minString = min.toString();
        }
        this.timeStrings.push('12:' + minString + ' ' + suffix);
      }

      // Next, iterate over every hour value in a 12 hour period
      for (var hour = 1; hour < 12; hour++) {
        // Finally, iterate over every minute value in an hour
        for (var min = 0; min < 60; min++) {
          // Add an extra zero for values less then 10
          if (min < 10) {
            var minString = '0' + min.toString();
          } else {
            var minString = min.toString();
          }
          this.timeStrings.push(hour + ':' + minString + ' ' + suffix);
        }
      }
    });
  }

  /**
   * Creates the `hourlyChargeStrings` array and `hourlyChargesMap` map in
   * this data object.
   */
  initHourlyCharges() {
    for (var i = 5; i <= 200; i += 5) {
      var chargeString = '$' + i + '.00';
      this.payments.hourlyChargeStrings.push(chargeString);
      this.payments.hourlyChargesMap[chargeString] = i;
    }
  }

  /**
   * Returns the Firestore document or collection reference given a reference
   * path in the form of an array.
   * @param {string[]} path - The path through the Firestore database to the
   * desired resource.
   * @param {external:CollectionReference} [ref=window.app.db] - The origin of
   * the path.
   * @return {(external:CollectionReference|external:DocumentReference)} The
   * Firestore resource that the `path` leads us to from the origin (`ref`).
   */
  static ref(path, ref = window.app.db) {
    for (var i = 0; i < path.length; i++)
      ref = i % 2 === 0 ? ref.collection(path[i]) : ref.doc(path[i]);
    return ref;
  }

  /**
   * A Firestore `QuerySnapshot` contains zero or more
   * [DocumentSnapshot]{@link external:DocumentSnapshot} objects representing
   * the results of a query. The documents can be accessed as an array via the
   * `docs` property or enumerated using the `forEach` method. The number of
   * documents can be determined via the `empty` and `size` properties.
   * @external QuerySnapshot
   * @see {@link https://firebase.google.com/docs/reference/js/firebase.firestore.QuerySnapshot}
   */

  /**
   * A Firestore `Query` refers to a `Query` which you can read or listen to.
   * You can also construct refined Query objects by adding filters and
   * ordering.
   * @external Query
   * @see {@link https://firebase.google.com/docs/reference/js/firebase.firestore.Query}
   */

  /**
   * A Firestore `DocumentSnapshot` contains data read from a document in your
   * Firestore database. The data can be extracted with `.data()` or
   * `.get(<field>)` to get a specific field.
   * @external DocumentSnapshot
   * @see {@link https://firebase.google.com/docs/reference/js/firebase.firestore.DocumentSnapshot}
   */

  /**
   * A Firestore `CollectionReference` object can be used for adding
   * documents, getting document references, and querying for documents
   * (using the methods inherited from `Query`).
   * @external CollectionReference
   * @extends external:Query
   * @see {@link https://firebase.google.com/docs/reference/js/firebase.firestore.CollectionReference}
   */

  /**
   * A Firestore `DocumentReference` refers to a document location in a
   * Firestore database and can be used to write, read, or listen to the
   * location. The document at the referenced location may or may not exist. A
   * `DocumentReference` can also be used to create a
   * [CollectionReference]{@link external:CollectionReference} to a
   * subcollection.
   * @external DocumentReference
   * @see {@link https://firebase.google.com/docs/reference/js/firebase.firestore.DocumentReference}
   */

  /**
   * A `Timestamp` represents a point in time independent of any time zone
   * or calendar, represented as seconds and fractions of seconds at
   * nanosecond resolution in UTC Epoch time.
   *
   * It is encoded using the Proleptic Gregorian Calendar which extends the
   * Gregorian calendar backwards to year one. It is encoded assuming all
   * minutes are 60 seconds long, i.e. leap seconds are "smeared" so that no
   * leap second table is needed for interpretation. Range is from
   * `0001-01-01T00:00:00Z` to `9999-12-31T23:59:59.999999999Z`.
   *
   * @external Timestamp
   * @see {@link https://firebase.google.com/docs/reference/js/firebase.firestore.Timestamp}
   * @see {@link https://github.com/google/protobuf/blob/master/src/google/protobuf/timestamp.proto}
   */

  /**
   * Handles a Firestore Query's snapshots.
   * @callback snapshotCallback
   * @param {(external:QuerySnapshot|external:DocumentSnapshot)} - A query's
   * snapshot.
   */

  /**
   * Handles a Firestore Query's errors.
   * @callback errorCallback
   * @param {Exception} - A query's error.
   */

  /**
   * Fetch and then listen to a Firestore query.
   * @see {@link https://firebase.google.com/docs/firestore/query-data/queries}
   * @param {(external:Query|string[])} query - The query or Firestore path to
   * listen to.
   * @param {snapshotCallback} next - Handles the query's snapshots.
   * @param {errorCallback} [error=() => {}] - Handles the query's errors.
   * @param {Object}
   * [options={db:window.app.db,listeners:window.app.listeners}] - Specifies
   * the database partition and listeners array to use.
   */
  static async listen(
    query,
    next,
    error = () => {},
    options = {
      db: window.app.db,
      listeners: window.app.listeners,
    }
  ) {
    const ref =
      query instanceof Array
        ? Data.ref(query, options.db || window.app.db)
        : query;
    const [err, snap] = await to(ref.get());
    err ? error(err) : await next(snap);
    (options.listeners || window.app.listeners).push(
      ref.onSnapshot({
        next: next,
        error: error,
      })
    );
  }

  /**
   * Returns the Algolia index based off of the given ID and current app
   * partition.
   * @param {string} id - The Algolia index ID.
   * @return {AlgoliaIndex} The initialized Algolia index.
   */
  static algoliaIndex(id) {
    return algoliasearch(
      '9FGZL7GIJM',
      '9ebc0ac72bdf6b722d6b7985d3e83550'
    ).initIndex((window.app.test ? 'test' : 'default') + '-' + id);
  }

  static addToWorkspace(uid, proxy = []) {
    return Data.updateUser({
      uid: uid,
      proxy: Data.concatArr(proxy, [window.app.user.uid]),
    });
  }

  static async getServiceHoursLog(params) {
    return axios({
      method: 'get',
      url: window.app.functionsURL + 'serviceHoursAsPDF',
      responseType: 'blob',
      params: Data.combineMaps(
        {
          token: await firebase.auth().currentUser.getIdToken(true),
          location: window.app.location.id,
          test: window.app.test,
        },
        params
      ),
    }).then((res) => {
      return window.URL.createObjectURL(res.data);
    });
  }

  static async getPDFBackup(params) {
    return axios({
      method: 'get',
      url: window.app.functionsURL + 'backupAsPDF',
      responseType: 'blob',
      params: Data.combineMaps(
        {
          token: await firebase.auth().currentUser.getIdToken(true),
          location: window.app.location.id,
          test: window.app.test,
          tutors: true,
          pupils: true,
        },
        params
      ),
    }).then((res) => {
      return window.URL.createObjectURL(res.data);
    });
  }

  static concatArr(arrA, arrB) {
    var result = [];
    arrA.forEach((item) => {
      if (result.indexOf(item) < 0 && item !== '') {
        result.push(item);
      }
    });
    arrB.forEach((item) => {
      if (result.indexOf(item) < 0 && item !== '') {
        result.push(item);
      }
    });
    return result;
  }

  // Sets the user's preferred location based on:
  // 1) Their availability
  // 2) The location of this app instance
  static updateUserLocation(user) {
    // TODO: Bug here is that data.locationNames only includes name of the
    // current app location (unless partition is 'Any').
    const locs = Object.keys(user.availability);
    // This uses the most recently added availability (i.e. the last key).
    locs.forEach(
      (loc) =>
        (user.location =
          window.app.data.locationNames.indexOf(loc) >= 0
            ? loc
            : window.app.location.name)
    );
    user.locations = Data.concatArr(locs, [window.app.location.name]);
  }

  // Adds a 'booked' field to every availability window on the given user by:
  // 1) Getting the user's appointments
  // 2) Changing 'booked' to false for every appointment's time field
  static async updateUserAvailability(user) {
    // Availability is stored in Firestore as:
    // 'Gunn Academic Center': {
    //   'Monday': [
    //     {
    //       open: '2:45 PM',
    //       close: '3:45 PM',
    //       booked: false,
    //     },
    //     {
    //       open: 'A Period',
    //       close: 'A Period',
    //       booked: true,
    //     },
    //   ],
    // },
    if (!user.uid)
      return console.warn(
        '[WARNING] Could not update ' +
          user.name +
          "'s availability without a valid uID."
      );
    const ref = window.app.db.collection('users').doc(user.uid);
    const appts = (await ref.collection('appointments').get()).docs;
    const bookedAvailability = {};
    appts.forEach((apptDoc) => {
      const appt = apptDoc.data();
      if (!bookedAvailability[appt.location.name])
        bookedAvailability[appt.location.name] = {};
      if (!bookedAvailability[appt.location.name][appt.time.day])
        bookedAvailability[appt.location.name][appt.time.day] = [];
      if (
        bookedAvailability[appt.location.name][appt.time.day].findIndex(
          (t) => t.open === appt.time.from && t.close === appt.time.to
        ) >= 0
      )
        return;
      bookedAvailability[appt.location.name][appt.time.day].push({
        open: appt.time.from,
        close: appt.time.to,
        booked: true,
      });
    });
    Object.entries(user.availability || {}).forEach((loc) => {
      // Iterate over locations in user's existing availability
      if (!bookedAvailability[loc[0]]) bookedAvailability[loc[0]] = {};
      // Iterate over days in each location
      Object.entries(loc[1]).forEach((day) => {
        if (!bookedAvailability[loc[0]][day[0]])
          bookedAvailability[loc[0]][day[0]] = [];
        // Iterate over timeslots in each day in each location
        day[1].forEach((timeslot) => {
          if (
            bookedAvailability[loc[0]][day[0]].findIndex(
              (t) => t.open === timeslot.open && t.close === timeslot.close
            ) < 0
          ) {
            // User does not have an appt at this timeslot, add it
            // to bookedAvailability as an unbooked timeslot.
            bookedAvailability[loc[0]][day[0]].push({
              open: timeslot.open,
              close: timeslot.close,
              booked: false,
            });
          }
        });
      });
    });
    return (user.availability = bookedAvailability);
  }

  static async getUser(id) {
    if (!id) {
      throw new Error('Could not get user data b/c id was undefined.');
    } else if (id.indexOf('@') >= 0) {
      throw new Error('Using an email as a user ID is deprecated.');
    }
    const ref = await window.app.db.collection('users').doc(id).get();
    if (ref.exists) return ref.data();
    throw new Error('User (' + id + ') did not exist.');
  }

  /**
   * Creates a new website configuration using our data REST API.
   * @param {Website} website - The website to create.
   * @return {Promise} Promise that resolves with the `res.data` once the
   * website has been created.
   */
  static createWebsite(website) {
    return Data.post('createWebsite', {
      website: website,
    });
  }

  /**
   * Updates a new website configuration using our data REST API.
   * @param {Website} website - The website to update.
   * @param {string} id - The ID of the website's Firestore document.
   * @return {Promise} Promise that resolves with the `res.data` once the
   * website has been updated.
   */
  static updateWebsite(website, id) {
    return Data.post('updateWebsite', {
      website: website,
      id: id,
    });
  }

  /**
   * Deletes a new website configuration using our data REST API.
   * @param {string} id - The ID of the website's Firestore document.
   * @return {Promise} Promise that resolves with the `res.data` once the
   * website has been deleted.
   */
  static deleteWebsite(id) {
    return Data.post('deleteWebsite', {
      id: id,
    });
  }

  static deleteLocation(id) {
    return Data.post('deleteLocation', {
      id: id,
    });
  }

  /**
   * Updates the given location's Firestore data.
   * @param {Location} location - The updated location data.
   * @param {string} id - The location's Firestore document ID.
   */
  static updateLocation(location, id) {
    return Data.post('updateLocation', {
      location: location,
      id: id,
    });
  }

  /**
   * Updates the given user's Firestore document.
   * @example
   * const Data = require('@tutorbook/data');
   * await Data.updateUser({ // Updates a subset of a specified user's
   * // data.
   *   uid: 'INSERT-THE-DESIRED-USER\'S-UID-HERE', // Make sure to always
   *   // include a valid user ID to update.
   *   grade: 'Junior', // Add data/fields you want to update here.
   *   gender: 'Male',
   *   subjects: ['Chemistry H'],
   * });
   * @param {Object} user - The user to update.
   * @see {@link module:@tutorbook/app~Tutorbook#updateUser}
   */
  static async updateUser(user) {
    await Data.updateUserAvailability(user);
    Data.updateUserLocation(user);
    if (!user) {
      throw new Error('Cannot update an undefined user.');
    } else if (!user.id && !user.email && !user.uid) {
      throw new Error('Could not update user b/c id was undefined.');
    } else if (user.uid) {
      return window.app.db.collection('users').doc(user.uid).update(user);
    } else {
      throw new Error('Using an email as a user ID is deprecated.');
    }
  }

  static deleteUser(id) {
    if (!id) {
      throw new Error('Could not delete user b/c id was undefined.');
    } else if (id.indexOf('@') >= 0) {
      throw new Error('Using an email as a user ID is deprecated.');
    }
    return window.app.db.collection('users').doc(id).delete();
  }

  static createUser(user) {
    if (!user) {
      throw new Error('Cannot create an undefined user.');
    } else if (!user.id && !user.uid && !user.email) {
      throw new Error('Could not create user b/c id was undefined.');
    } else if (user.uid) {
      return window.app.db.collection('users').doc(user.uid).set(user);
    } else if (
      window.app.user.type === 'Supervisor' &&
      window.app.user.id !== user.id
    ) {
      return Data.post('createProxyUser', {
        user: user,
      });
    } else {
      console.warn('[WARNING] Using an email as a user ID is ' + 'deprecated.');
      return window.app.db
        .collection('usersByEmail')
        .doc(user.id || user.email)
        .set(user);
    }
  }

  static getOther(notThisUser, attendees) {
    // Don't create dependency loops
    if (!notThisUser.email && !!notThisUser.length) {
      if (notThisUser[0].email === window.app.user.email) {
        return notThisUser[1];
      }
      return notThisUser[0];
    }
    if (attendees[0].email === notThisUser.email) {
      return attendees[1];
    }
    return attendees[0];
  }

  // This post function calls a REST API that will:
  // 1) perform the given action using information given
  // 2a) axios will throw a "Network Error" for uncaught errors server-side
  // 2b) res.data will be "ERROR" for known errors server-side
  // 2c) res.data will be "SUCCESS" when there are no errors server-side
  // Whenever a data function is called, the app will wait for a "SUCCESS"
  // before showing the user a snackbar. If an error is thrown, we show the
  // user an error message snackbar.
  static async post(action, data) {
    return axios({
      method: 'post',
      url: window.app.functionsURL + 'data',
      params: {
        test: window.app.test,
        user: window.app.user.uid,
        action: action,
        token: await firebase.auth().currentUser.getIdToken(true),
      },
      data: data,
    })
      .then((res) => {
        if (typeof res.data === 'string' && res.data.indexOf('ERROR') > 0)
          throw new Error(res.data.replace('[ERROR] ', ''));
        return res.data;
      })
      .catch((err) => {
        console.error('[ERROR] During ' + action + ' REST API call.', err);
        throw err;
      });
  }

  static requestPayout() {
    return Data.post('requestPayout');
  }

  static requestPaymentFor(appt, id) {
    return Data.post('requestPaymentFor', {
      appt: appt,
      id: id,
    });
  }

  static approvePayment(approvedPayment, id) {
    return Data.post('approvePayment', {
      approvedPayment: approvedPayment,
      id: id,
    });
  }

  static denyPayment(deniedPayment, id) {
    return Data.post('denyPayment', {
      deniedPayment: deniedPayment,
      id: id,
    });
  }

  static rejectClockIn(clockIn, id) {
    return Data.post('rejectClockIn', {
      clockIn: clockIn,
      id: id,
    });
  }

  static approveClockIn(clockIn, id) {
    return Data.post('approveClockIn', {
      clockIn: clockIn,
      id: id,
    });
  }

  static rejectClockOut(clockOut, id) {
    return Data.post('rejectClockOut', {
      clockOut: clockOut,
      id: id,
    });
  }

  static approveClockOut(clockOut, id) {
    return Data.post('approveClockOut', {
      clockOut: clockOut,
      id: id,
    });
  }

  static combineMaps(mapA, mapB) {
    // Avoid dependency loops with Utils
    // NOTE: This function gives priority to mapB over mapA
    const result = {};
    for (var i in mapA) result[i] = mapA[i];
    for (var i in mapB) result[i] = mapB[i];
    return result;
  }

  static cloneMap(map) {
    // Don't create dependency loops by require('@tutorbook/utils')
    var clone = {};
    for (var i in map) {
      clone[i] = map[i];
    }
    return clone;
  }

  static async getLocationSupervisor(id) {
    try {
      const doc = await window.app.db.collection('locations').doc(id).get();
      const supervisors = doc.data().supervisors;
      return supervisors[0]; // TODO: How do we check to see if a given
      // supervisor is actually active on the app right now?
    } catch (e) {
      console.warn(
        '[WARNING] Could not get location (' + id + ') ' + 'supervisor b/c of ',
        e
      );
      window.app.snackbar.view('Could not find location supervisor.');
      window.app.nav.back();
    }
  }

  static instantClockIn(appt, id) {
    // Sends and approves clock in request
    return Data.post('instantClockIn', {
      appt: appt,
      id: id,
    });
  }

  static instantClockOut(appt, id) {
    // Sends and approves clock out request
    return Data.post('instantClockOut', {
      appt: appt,
      id: id,
    });
  }

  static clockIn(appt, id, proof) {
    return Data.post('clockIn', {
      appt: appt,
      id: id,
      proof: proof,
    });
  }

  static clockOut(appt, id, proof) {
    return Data.post('clockOut', {
      appt: appt,
      id: id,
      proof: proof,
    });
  }

  static approveRequest(request, id) {
    return Data.post('approveRequest', {
      request: request,
      id: id,
    });
  }

  static modifyAppt(appt, id) {
    return Data.post('modifyAppt', {
      appt: appt,
      id: id,
    });
  }

  static newPastAppt(appt) {
    return Data.post('newPastAppt', {
      appt: appt,
    });
  }

  static modifyPastAppt(appt, id) {
    return Data.post('modifyPastAppt', {
      appt: appt,
      id: id,
    });
  }

  static deletePastAppt(appt, id) {
    return Data.post('deletePastAppt', {
      appt: appt,
      id: id,
    });
  }

  static cancelAppt(appt, id) {
    return Data.post('cancelAppt', {
      appt: appt,
      id: id,
    });
  }

  static rejectRequest(request, id) {
    return Data.post('rejectRequest', {
      request: request,
      id: id,
    });
  }

  static cancelRequest(request, id) {
    return Data.post('cancelRequest', {
      request: request,
      id: id,
    });
  }

  static modifyRequest(request, id) {
    return Data.post('modifyRequest', {
      request: request,
      id: id,
    });
  }

  static trimObject(ob) {
    const result = {};
    Object.entries(ob).forEach((entry) => {
      switch (typeof entry[1]) {
        case 'string':
          result[entry[0]] = entry[1].trim();
          break;
        case 'object': // Yay recursion!
          if (!entry[1].getTime) {
            result[entry[0]] = Data.trimObject(entry[1]);
          } else {
            // It's a timestamp (don't try to trim it)
            result[entry[0]] = entry[1];
          }
          break;
        default:
          result[entry[0]] = entry[1];
      }
    });
    return result;
  }

  static newRequest(request, payment) {
    return Data.post('newRequest', {
      request: request,
      payment: payment,
    });
  }

  static newTimeRequest(request) {
    return Data.post('newTimeRequest', {
      request: request,
    });
  }

  static rejectTimeRequest(request, id) {
    return Data.post('rejectTimeRequest', {
      request: request,
      id: id,
    });
  }

  static modifyTimeRequest(request, id) {
    return Data.post('modifyTimeRequest', {
      request: request,
      id: id,
    });
  }

  static approveTimeRequest(request, id) {
    return Data.post('approveTimeRequest', {
      request: request,
      id: id,
    });
  }
}

Data.setupCards = [
  'searchTutors',
  'setupNotifications',
  'setupProfile',
  'setupAvailability',
  'addChildren',
];

// This is not static and thus has to include `prototype` in it's definition
Data.prototype.payments = {
  types: ['Free', 'Paid'],
  hourlyChargeStrings: [],
  hourlyChargesMap: {},
};

Data.prices = ['Free', 'Paid'];

// Round clocking times to the nearest (e.g. '5 Minutes' : 4:23 PM --> 4:25 PM).
Data.timeThresholds = ['Minute', '5 Minutes', '10 Minutes', '30 Minutes'];

// Always round service hour durations (e.g. 'Up' : 23 mins --> 30 mins).
Data.roundings = ['Up', 'Down', 'Normally'];

// Round durations to the nearest (e.g. 'Minute' : 23.3 mins --> 23 mins).
Data.thresholds = ['Minute', '5 Minutes', '15 Minutes', '30 Minutes', 'Hour'];

/**
 * An open hours object that represents/stores when a location is open for
 * tutoring.
 * @typedef {Object} Hours
 * @global
 * @todo Add property definitions for the days of the week.
 * @todo Refactor this data storage object to allow for more flexibility in
 * Firestore indexes/queries.
 */

/**
 * A location object that stores tutoring location configuration data.
 * @typedef {Object} Location
 * @global
 * @property {string} name - The location's name (e.g. Gunn Academic Center).
 * @property {string} [description=''] - The location's description.
 * @property {string} [city='Palo Alto, CA'] - The location's city.
 * @property {Hours} hours - The location's open hours.
 * @property {Object} config - Configuration data (e.g. service hour rounding).
 * @property {string[]} supervisors - An array of supervisor uIDs.
 * @property {Date} timestamp - When the location was first created.
 * @property {string} [url='https://tutorbook.app'] - The URL of the location's
 * preferred app partition.
 */

Data.emptyLocation = {
  name: '',
  description: '',
  city: 'Palo Alto, CA',
  hours: {},
  config: {
    hrs: {
      timeThreshold: Data.timeThresholds[0],
      threshold: Data.thresholds[0],
      rounding: Data.roundings[0],
    },
  },
  supervisors: [],
  timestamp: new Date(),
  url: 'https://tutorbook.app',
};

/**
 * A profile/user object that stores essential user data.
 * @typedef {Object} Profile
 * @global
 * @property {string} name - The user's full name (initially grabbed from
 * their Google account and unchangeable by them).
 * @property {string} [photo='https://tutorbook.app/app/img/male.png'] - The
 * user's profile photo (also initially grabbed from their Google account but it
 * is changeable from their [profile view]{@linkplain Profile}).
 * @property {string} uid - Their unique Firebase Authentication user
 * identifier.
 * @property {string[]} access - An array of `accessIds` (school district
 * Firestore document IDs) that denote what data this user has access to.
 * @todo Finish adding all collected properties to this user object definition.
 */

Data.emptyProfile = {
  name: '',
  uid: '',
  photo: '',
  access: [],
  id: '', // Right now, we just use email for id
  email: '',
  phone: '',
  type: '',
  gender: '',
  grade: '',
  bio: '',
  avgRating: 0,
  numRatings: 0,
  subjects: [],
  cards: {},
  config: {
    showPayments: false,
    showProfile: true,
  },
  settings: {},
  availability: {},
  payments: {
    hourlyChargeString: '$25.00',
    hourlyCharge: 25,
    totalChargedString: '$0.00',
    totalCharged: 0,
    currentBalance: 0,
    currentBalanceString: '$0.00',
    type: 'Free',
    policy:
      'Hourly rate is $25.00 per hour. Will accept ' +
      'lesson cancellations if given notice within 24 hours.' +
      ' No refunds will be issued unless covered by a Tutorbook ' +
      'guarantee.',
  },
  authenticated: false,
  secondsTutored: 0,
  secondsPupiled: 0,
  location: window.app ? window.app.location.name || '' : '',
  locations: window.app ? [window.app.location.name] : [],
};

Data.gunnSchedule = {
  // TODO: Actually populate this with the right daily schedule
  Monday: ['A Period', 'B Period', 'C Period', 'F Period'],
  Tuesday: ['D Period', 'Flex', 'E Period', 'A Period', 'G Period'],
  Wednesday: ['B Period', 'C Period', 'D Period', 'F Period'],
  Thursday: ['E Period', 'Flex', 'B Period', 'A Period', 'G Period'],
  Friday: ['C Period', 'D Period', 'E Period', 'F Period', 'G Period'],
  Saturday: ['No school'],
  Sunday: ['No school'],
};

Data.periods = [
  'A Period', // Gunn
  'B Period',
  'C Period',
  'D Period',
  'E Period',
  'F Period',
  'G Period',
  'Flex',
  '3rd Period', // Paly
  '4th Period',
  '5th Period',
  '6th Period',
  '7th Period',
  'Lunch',
  'Tutorial',
  'Afterschool',
];

Data.locations = ['Gunn Academic Center', 'Paly Peer Tutoring Center'];

Data.addresses = {
  Any: '780 Arastradero Rd, Palo Alto, CA 94306',
  'Gunn Academic Center': '780 Arastradero Rd, Palo Alto, CA 94306',
  'Paly Peer Tutoring Center': '50 Embarcadero Rd, Palo Alto, CA 94301',
};

Data.cities = ['Palo Alto, CA', 'Mountain View, CA', 'East Palo Alto, CA'];

Data.days = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// List of subjects taken directly from AC Application form
Data.mathSubjects = [
  'Algebra 1', // Gunn
  'Algebra 1A',
  'Algebra 2',
  'Algebra 2/Trig A',
  'Algebra 2/Trig H',
  'Analysis H',
  'AP Calculus AB',
  'AP Calculus BC',
  'Geometry A',
  'Geometry A/Alg 1A',
  'Geometry H',
  'Geometry/ Alg 2A',
  'IAC',
  'Pre-Calculus',
  'Pre-Calculus A',
  'AP Statistics',
  'Applied Math',
  'Geometry', // Paly
  'Calculus',
  'Pre-Algebra', // JLS
  'Math 6',
  'Math 7',
  'Math 7A',
  'Math 8',
  'Algebra 8',
];

Data.techSubjects = [
  'Computer Science', // Gunn
  'AP Comp Sci A',
  'AP Comp Sci P',
  'FOOP',
  'Industrial Tech 1A', // JLS
  'Industrial Tech 1B',
  'Keyboarding',
  'Computer Programming',
  'Web Design 1A',
  'Web Design 1B',
  'Design and Technology',
  'Yearbook',
  'Multimedia Art',
  'Video Production',
];

Data.artSubjects = [
  'Art Spectrum', // Gunn
  'AP Art History',
  'Photography 1',
  'Video 1',
  'AP Music Theory',
  'Music Theory', // Paly
  'Yearbook', // JLS
  'Video Production',
  'Art 1A',
  'Art 1B',
  'Ceramics and Sculpture',
  'Multimedia Art',
  'Drama 1A',
  'Drama 1B',
];

Data.scienceSubjects = [
  'Astrophysics', // Gunn
  'Biology 1',
  'Biology 1A',
  'Biology H',
  'AP Biology',
  'Biotechnology',
  'Marine Biology',
  'Chemistry',
  'Chemistry H',
  'AP Chemistry',
  'Conceptual Physics',
  'Physics',
  'AP Physics 1',
  'AP Physics C',
  'APES Env Sci',
  'Physics H', // Paly
  'Science 6', // JLS
  'Science 7',
  'Science 8',
];

Data.historySubjects = [
  'World History', // Gunn
  'Cont World History',
  'Government',
  'US History',
  'APUSH',
  'Economics',
  'AP Economics',
  'Psychology',
  'AP Psychology',
  'Social Studies 6', // JLS
  'Social Studies 7',
  'Social Studies 8',
];

Data.languageSubjects = [
  'French 1', // Gunn
  'French 2',
  'French 3',
  'AP French',
  'German 1',
  'German 2',
  'German 3',
  'AP German',
  'Japanese 1',
  'Japanese 2',
  'Japanese 3',
  'AP Japanese',
  'Mandarin 1',
  'Mandarin 2',
  'Mandarin 3',
  'AP Mandarin',
  'Spanish 1',
  'Spanish 2',
  'Spanish 3',
  'AP Spanish',
  'French 1A', // JLS
  'French 1B',
  'Japanese 1A',
  'Japanese 1B',
  'Spanish 1A',
  'Spanish 1B',
  'Mandarin 1A',
  'German 1A',
];

Data.englishSubjects = [
  'Western Lit', // Gunn
  'Western Culture',
  'Communication',
  'World Lit',
  'World Classics H',
  'AP English Lit and Composition',
  'Fundamentals of Communication',
  'Advanced Communication',
  'American Lit',
  'Basic College Skills',
  'The Works of Shakespeare',
  'Escape Lit',
  'Classic Mythology',
  'Shakespeare in Performance',
  'Film as Composition in Lit',
  'Analysis of the Writers Craft',
  'Philosophy through Lit',
  'Reading Between the Lines',
  'The Art of Visual Storytelling',
  'Modern California Lit',
  'Women Writers',
  'English 6', // JLS
  'English 7',
  'English 8',
  'English 9', // Paly
  'English 10',
];

Data.lifeSkills = [
  'Planning', // Gunn
  'Organization',
  'Study Skills',
  'Other',
  'Leadership', // JLS
  'Public Speaking',
];

Data.subjects = [
  // MATH
  'Algebra 1', // Gunn
  'Algebra 1A',
  'Algebra 2',
  'Algebra 2/Trig A',
  'Algebra 2/Trig H',
  'Analysis H',
  'AP Calculus AB',
  'AP Calculus BC',
  'Geometry A',
  'Geometry A/Alg 1A',
  'Geometry H',
  'Geometry/ Alg 2A',
  'IAC',
  'Pre-Calculus',
  'Pre-Calculus A',
  'AP Statistics',
  'Applied Math',
  'Geometry', // Paly
  'Calculus',
  'English 9',
  'English 10',
  'Pre-Algebra', // JLS
  'Math 6',
  'Math 7',
  'Math 7A',
  'Math 8',
  'Algebra 8',
  // TECHNOLOGY
  'Computer Science', // Gunn
  'AP Comp Sci A',
  'AP Comp Sci P',
  'FOOP',
  'Industrial Tech 1A', // JLS
  'Industrial Tech 1B',
  'Keyboarding',
  'Computer Programming',
  'Web Design 1A',
  'Web Design 1B',
  'Design and Technology',
  'Yearbook',
  'Multimedia Art',
  'Video Production',
  // ART
  'Art Spectrum', // Gunn
  'AP Art History',
  'Photography 1',
  'Video 1',
  'AP Music Theory',
  'Music Theory', // Paly
  'Yearbook', // JLS
  'Video Production',
  'Art 1A',
  'Art 1B',
  'Ceramics and Sculpture',
  'Multimedia Art',
  'Drama 1A',
  'Drama 1B',
  // SCIENCE
  'Astrophysics', // Gunn
  'Biology 1',
  'Biology 1A',
  'Biology H',
  'AP Biology',
  'Biotechnology',
  'Marine Biology',
  'Chemistry',
  'Chemistry H',
  'AP Chemistry',
  'Conceptual Physics',
  'Physics',
  'AP Physics 1',
  'AP Physics C',
  'APES Env Sci',
  'Physics H', // Paly
  'Science 6', // JLS
  'Science 7',
  'Science 8',
  // HISTORY
  'World History', // Gunn
  'Cont World History',
  'Government',
  'US History',
  'APUSH',
  'Economics',
  'AP Economics',
  'Psychology',
  'AP Psychology',
  'Social Studies 6', // JLS
  'Social Studies 7',
  'Social Studies 8',
  // LANGUAGE
  'French 1', // Gunn
  'French 2',
  'French 3',
  'AP French',
  'German 1',
  'German 2',
  'German 3',
  'AP German',
  'Japanese 1',
  'Japanese 2',
  'Japanese 3',
  'AP Japanese',
  'Mandarin 1',
  'Mandarin 2',
  'Mandarin 3',
  'AP Mandarin',
  'Spanish 1',
  'Spanish 2',
  'Spanish 3',
  'AP Spanish',
  'French 1A', // JLS
  'French 1B',
  'Japanese 1A',
  'Japanese 1B',
  'Spanish 1A',
  'Spanish 1B',
  'Mandarin 1A',
  'German 1A',
  // ENGLISH
  'Western Lit', // Gunn
  'Western Culture',
  'Communication',
  'World Lit',
  'World Classics H',
  'AP English Lit and Composition',
  'Fundamentals of Communication',
  'Advanced Communication',
  'American Lit',
  'Basic College Skills',
  'The Works of Shakespeare',
  'Escape Lit',
  'Classic Mythology',
  'Shakespeare in Performance',
  'Film as Composition in Lit',
  'Analysis of the Writers Craft',
  'Philosophy through Lit',
  'Reading Between the Lines',
  'The Art of Visual Storytelling',
  'Modern California Lit',
  'Women Writers',
  'English 6', // JLS
  'English 7',
  'English 8',
  // LIFE SKILLS
  'Planning', // Gunn
  'Organization',
  'Study Skills',
  'Other',
  'Leadership', // JLS
  'Public Speaking',
];

Data.genders = ['Male', 'Female', 'Other'];

Data.types = ['Tutor', 'Pupil', 'Teacher', 'Parent', 'Supervisor'];

Data.grades = [
  'Adult',
  'Senior', // High School
  'Junior',
  'Sophomore',
  'Freshman',
  '8th Grade', // Middle School
  '7th Grade',
  '6th Grade',
  '5th Grade', // Elementary School
  '4th Grade',
  '3rd Grade',
  '2nd Grade',
  '1st Grade',
  'Kindergarten',
];

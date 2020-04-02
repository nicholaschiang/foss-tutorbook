const functions = require('firebase-functions');
const admin = require('firebase-admin').initializeApp();

const updateSheet = require('sheet');
const updateAuth = require('auth');
const Hours = require('hours');
const PDF = require('pdf');
const SMS = require('sms');
const Algolia = require('algolia');
const Data = require('data');
const Notify = require('notifications');
const Payments = require('payments');
const Stats = require('stats');

// ============================================================================
// DATA EXPORTATION
// ============================================================================

exports.serviceHoursAsPDF = functions.https.onRequest(PDF.hrs);

exports.backupAsPDF = functions.https.onRequest(PDF.backup);

exports.updateSheet = functions.https.onRequest(updateSheet);

// ============================================================================
// SERVICE HOUR TRACKING
// ============================================================================

exports.updateHours = functions.firestore
  .document('/partitions/{partition}/users/{user}/pastAppointments/{appt}')
  .onCreate(Hours.update);

exports.roundHours = functions.firestore
  .document(
    '/partitions/{partition}/locations/{location}/pastAppointments' + '/{appt}'
  )
  .onCreate(Hours.round);

// ============================================================================
// SEARCH (VIA ALGOLIA)
// ============================================================================

exports.algoliaUserUpdate = functions.firestore
  .document('/partitions/{partition}/users/{id}')
  .onWrite(Algolia.user);

exports.algoliaApptUpdate = functions.firestore
  .document('/partitions/{partition}/locations/{location}/appointments/{id}')
  .onWrite(Algolia.appt);

exports.algoliaActiveApptUpdate = functions.firestore
  .document(
    '/partitions/{partition}/locations/{location}/' + 'activeAppointments/{id}'
  )
  .onWrite(Algolia.activeAppt);

exports.algoliaPastApptUpdate = functions.firestore
  .document(
    '/partitions/{partition}/locations/{location}/pastAppointments' + '/{id}'
  )
  .onWrite(Algolia.pastAppt);

exports.algoliaChatUpdate = functions.firestore
  .document('/partitions/{partition}/chats/{id}')
  .onWrite(Algolia.chat);

// ============================================================================
// PAYMENTS (STRIPE)
// ============================================================================

// 0) Tutor links Stripe Connect account (Function creates stripeAccount doc and
// sets weekly payouts for every Friday).
exports.initStripeAccount = functions.https.onRequest(Payments.initAccount);

exports.accountURL = functions.https.onRequest(Payments.accountURL);

// 1) Pupil creates request & authPayment doc (Function processes authPayment).
exports.updatePaymentMethods = functions.firestore
  .document('/partitions/{partition}/stripeCustomers/{user}/methods/{method}')
  .onCreate(Payments.addMethod);

exports.processAuthPayment = functions.firestore
  .document('/partitions/{partition}/users/{pupil}/sentPayments/{payment}')
  .onCreate(Payments.processSentPayment);

// 1b) Pupil or tutor cancels request or appt and `data` function deletes
// authPayment docs.
exports.cancelAuthPayment = functions.firestore
  .document('/partitions/{partition}/users/{user}/authPayments/{payment}')
  .onDelete(Payments.cancelAuthPayment);

// 2) TODO: Tutor clocks out & creates creates pastAppt docs (Function creates
// pendingPayments => asking pupil for payment approval).
/*
 *exports.askForPaymentApproval = functions.firestore
 *    .document('/partitions/{partition}/users/{user}/pastAppointments/{appt}')
 *    .onCreate(Payments.askForPayment);
 */

// 2) Tutor clicks "Request Payment" FAB in ViewApptDialog which creates a
// requestedPayment doc in the pupil's subcollections (via the data REST API).

// 3) Pupil approves payment by creating approvedPayment docs (Function
// sends payment to the tutor minus our 10% fee & creates pastPayment docs).
exports.processPayment = functions.firestore
  .document('/partitions/{partition}/users/{user}/approvedPayments/{payment}')
  .onCreate(Payments.processPayment);

exports.increaseBalance = functions.firestore
  .document('/partitions/{partition}/users/{user}/pastPayments/{payment}')
  .onCreate(Payments.updateBalance);

// 4) TODO: Tutor requests payout by creating requestedPayout doc (Function
// sends payout & creates pastPayout doc).
exports.processPayout = functions.firestore
  .document('/partitions/{partition}/users/{tutor}/requestedPayouts/{payout}')
  .onCreate(Payments.processPayout);

exports.decreaseBalance = functions.firestore
  .document('/partitions/{partition}/users/{user}/pastPayouts/{payout}')
  .onCreate(Payments.updateBalance);

// 4) Stripe weekly (on Fridays) webhook sends payout (& triggers Function to
// create pastPayout doc).
exports.processWeeklyPayouts = functions.https.onRequest(
  Payments.processWeeklyPayouts
);

// ============================================================================
// OTHER
// ============================================================================

exports.updateAuthClaims = functions.firestore
  .document('/partitions/{partition}/users/{id}')
  .onWrite(updateAuth);

exports.data = functions.https.onRequest(Data.onRequest);

exports.sms = functions.https.onRequest(SMS.receive());

exports.smsFallback = functions.https.onRequest(SMS.fallback);

exports.userUpdateStat = functions.firestore
  .document('/partitions/{partition}/users/{user}')
  .onWrite(Stats.userUpdate);

// ============================================================================
// NOTIFICATIONS (EMAIL, SMS, & WEBPUSH)
// ============================================================================

exports.apptRulesNotification = functions.firestore
  .document(
    '/partitions/{partition}/locations/{location}/appointments' + '/{appt}'
  )
  .onCreate(Notify.rules);

exports.newUserNotification = functions.firestore
  .document('/partitions/{partition}/users/{id}')
  .onCreate(Notify.user);

exports.announcementNotification = functions.firestore
  .document(
    '/partitions/{partition}/locations/{location}/announcements' +
      '/{announcement}/messages/{message}'
  )
  .onCreate(Notify.announcement);

exports.messageNotification = functions.firestore
  .document('/partitions/{partition}/chats/{chat}/messages/{message}')
  .onCreate(Notify.message);

exports.feedbackNotification = functions.firestore
  .document('/partitions/{partition}/feedback/{id}')
  .onCreate(Notify.feedback);

// REQUESTs
exports.newRequestNotification = functions.firestore
  .document('/partitions/{partition}/users/{user}/requestsIn/{request}')
  .onCreate(Notify.requestIn);

exports.canceledRequestNotification = functions.firestore
  .document(
    '/partitions/{partition}/users/{user}/canceledRequestsIn' + '/{request}'
  )
  .onCreate(Notify.canceledIn);

exports.modifiedRequestInNotification = functions.firestore
  .document(
    '/partitions/{partition}/users/{user}/modifiedRequestsIn' + '/{request}'
  )
  .onCreate(Notify.modifiedIn);

exports.approvedRequestNotification = functions.firestore
  .document(
    '/partitions/{partition}/users/{user}/approvedRequestsOut' + '/{request}'
  )
  .onCreate(Notify.approvedOut);

exports.rejectedRequestNotification = functions.firestore
  .document(
    '/partitions/{partition}/users/{user}/rejectedRequestsOut' + '/{request}'
  )
  .onCreate(Notify.rejectedOut);

exports.modifiedRequestOutNotification = functions.firestore
  .document(
    '/partitions/{partition}/users/{user}/modifiedRequestsOut' + '/{request}'
  )
  .onCreate(Notify.modifiedOut);

// CLOCK-IN/OUTs
exports.clockInNotification = functions.firestore
  .document('/partitions/{partition}/users/{supervisor}/clockIns/{clockIn}')
  .onCreate(Notify.clockIn);

exports.clockOutNotification = functions.firestore
  .document('/partitions/{partition}/users/{supervisor}/clockOuts/{clockOut}')
  .onCreate(Notify.clockOut);

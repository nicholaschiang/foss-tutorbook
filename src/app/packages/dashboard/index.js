import {
    MDCTopAppBar
} from '@material/top-app-bar/index';

import $ from 'jquery';

const Data = require('data');
const Tracking = require('tracking');
const Card = require('card');
const Utils = require('utils');

// Class that manages the dashboard view (provides an API for other classes to
// use to display cards) and a custom welcome message that chnages each time a 
// user logs in.
class Dashboard {

    constructor() {
        this.render = window.app.render;
        this.initDismissedCards();
        this.renderSelf();
    }

    initDismissedCards() {
        this.dismissedCards = [];
        if (window.app.user.type === 'Supervisor') {
            var that = window.app;
            return firebase.firestore().collection('users').doc(window.app.user.email)
                .collection('dismissedCards').get().then((snapshot) => {
                    snapshot.forEach((doc) => {
                        this.dismissedCards.push(doc.id);
                    });
                }).catch((err) => {
                    console.error('Error while initializing dismissedCards:', err);
                });
        }
    }

    view() {
        window.app.nav.selected = 'Home';
        window.app.intercom.view(true);
        window.app.view(this.header, this.main, '/app/home');
        MDCTopAppBar.attachTo(this.header);
        this.viewDefaultCards(window.app.user.id);
    }

    reView() {
        MDCTopAppBar.attachTo(this.header);
        this.reViewCards();
    }

    reViewCards() { // It's too hard to re-add all unique event listeners
        this.viewDefaultCards(window.app.user.id);
    }

    renderSelf() {
        this.header = this.render.header('header-main', {
            'title': 'Tutorbook'
        });
        this.main = this.render.template('dashboard', {
            // If the user is viewing on mobile, we don't
            // want to show the welcome message in huge text.
            welcome: !window.app.onMobile,
            title: 'Welcome, ' + window.app.user.name.split(' ')[0],
            subtitle: 'We\'re glad you\'re here. Below are some friendly ' +
                'suggestions for what to do next.',
        });
    }

    // Views the default user cards for given userID
    viewDefaultCards(id) {
        if (!id) {
            id = window.app.user.id;
        }
        this.emptyCards('default');
        [
            'requestsIn',
            'canceledRequestsIn',
            'modifiedRequestsIn',
            'requestsOut',
            'modifiedRequestsOut',
            'rejectedRequestsOut',
            'approvedRequestsOut',
            'appointments',
            'activeAppointments',
            'modifiedAppointments',
            'canceledAppointments',
        ].forEach((subcollection) => {
            const query = firebase.firestore().collection('users')
                .doc(id)
                .collection(subcollection)
                .orderBy('timestamp', 'desc');
            this.viewCards(query, subcollection, 'default');
        });
        Data.setupCards.forEach((type) => {
            if (!!window.app.user.cards[type]) {
                this.viewCard(
                    new Card(true, Utils.genID(), type, 2).el,
                    $(this.main).find('#default')
                );
            }
        });
        if (window.app.user.type === 'Supervisor') {
            this.viewCard(Tracking.renderCard(), $(this.main).find('#default'));
        }
    }

    // Views cards (onSnapshot) from a given query (most recent on top) using a
    // given card type function.
    viewCards(query, type, listID, actions) {
        const list = $(this.main).find('#' + listID);
        const id = Utils.genID(); // Unique ID for every query in dashboard
        const recycler = {
            empty: (list) => {
                if (actions && typeof actions.empty === "function")
                    actions.empty();
                $(list).find('#cards [query="' + id + '"]').remove();
            },
            display: (doc, list) => {
                if (actions && typeof actions.display === "function")
                    actions.display(doc);
                this.viewCard(new Card(doc, id, type).el, list);
            },
            remove: (doc, list) => {
                if (actions && typeof actions.remove === "function")
                    actions.remove(doc);
                $(list).find('#cards [id="' + doc.id + '"]').remove();
            },
        };
        query.onSnapshot((snapshot) => {
            if (!snapshot.size) {
                return recycler.empty(list);
            }
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'removed') {
                    recycler.remove(change.doc, list);
                } else {
                    recycler.display(change.doc, list);
                }
            });
        });
    }

    emptyCards(list) {
        return $(list).find('#cards').empty();
    }

    // Adds card based on priority and/or timestamp (highest priority on the top 
    // followed by the most recent).
    viewCard(card, list) {
        var existing = $(list)
            .find('#cards [id="' + $(card).attr('id') + '"]');
        if (existing.length) {
            return $(existing).replaceWith(card);
        }
        // First, find the cards with the same priority as this card
        existing = $(list)
            .find('#cards [priority="' + $(card).attr('priority') + '"]');
        if (existing.length) {
            // Add by timestamp
            for (var i = 0; i < existing.length; i++) {
                var child = existing[i];
                var time = $(child).attr('timestamp');
                if (time && time < $(card).attr('timestamp')) {
                    break;
                }
            }
            if (!child) {
                $(card).insertAfter(existing);
            } else {
                $(card).insertBefore(child);
            }
        } else {
            // Add by priority
            existing = $(list)
                .find('#cards .mdc-card');
            for (var i = 0; i < existing.length; i++) {
                var child = existing[i];
                var priority = $(child).attr('priority');
                if (priority && priority > $(card).attr('priority')) {
                    return $(card).insertAfter(child);
                }
            }
            $(list).find('#cards').prepend(card);
        }
    }
};


// Splits dashboard view into three sections (and adds "Create Profile" fabs):
// 1) Actionable items (e.g. enable notifications, track service hours, edit
// your location)
// 2) Pending matches (e.g. pupil accounts that have not been matched yet or job
// offers that have no responses)
// 3) Everything else (e.g. cards w/ #s => "125 Tutors" or "56 Pupils")
class SupervisorDashboard extends Dashboard {

    constructor() {
        super();
    }

    renderSelf() {
        super.renderSelf();
        $(this.main).append(
            this.render.divider('Everything else')
        );
        $(this.main).append(
            $(this.render.template('cards')).attr('id', 'everything')
        );
    }

    viewDefaultCards() {
        super.viewDefaultCards();
        this.viewPendingMatches();
        this.viewEverythingElse();
    }

    viewPendingMatches() {
        const queries = {
            matches: firebase.firestore().collection('users')
                .where('proxy', 'array-contains', window.app.user.id),
        };
        Object.entries(queries).forEach((entry) => {
            this.viewCards(entry[1], entry[0], 'matching');
        });
    }

    viewEverythingElse() {
        const queries = {
            tutors: firebase.firestore().collection('users')
                .where('location', '==', window.app.location)
                .where('type', '==', 'Tutor'),
            pupils: firebase.firestore().collection('users')
                .where('location', '==', window.app.location)
                .where('type', '==', 'Pupil'),
            /*
             *appts: firebase.firestore().collection('locations')
             *    .doc(window.app.user.locations[0]) // TODO: Add >1 location
             *    .collection('appointments')
             *    .get(),
             */
        };
        Object.entries(queries).forEach((entry) => {
            this[entry[0]] = 0;
            this.viewCards(entry[1], entry[0], 'everything', {
                empty: () => {
                    this[entry[0]] = 0;
                },
                remove: (doc) => {
                    this[entry[0]]--;
                },
                display: (doc) => {
                    this[entry[0]]++;
                },
            });
        });
        const recycler = {
            empty: (type) => {
                console.log('TODO: Emptying hidden ' + type + ' dashboard');
            },
            display: (doc, type) => {
                console.log('TODO: Displaying (' + doc.id + ') in ' + type +
                    ' dashboard');
            },
            remove: (doc, type) => {
                console.log('TODO: Removing (' + doc.id + ') from ' + type +
                    ' dashboard');
            },
        };
        Utils.recycle(queries, recycler);
    }

    viewCard(card, list) {
        const existing = $(list).find('[card-id="' + $(card)
            .attr('card-id') + '"]');
        if (!$(card).attr('card-id') || !existing.length) return super
            .viewCard(card, list);
        existing.replaceWith(card);
    }
};


module.exports = {
    default: Dashboard,
    supervisor: SupervisorDashboard,
};
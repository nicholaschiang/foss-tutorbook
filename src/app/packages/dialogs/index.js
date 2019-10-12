import {
    MDCTextField
} from '@material/textfield/index';
import {
    MDCRipple
} from '@material/ripple/index';
import {
    MDCDialog
} from '@material/dialog/index';
import {
    MDCTopAppBar
} from '@material/top-app-bar/index';

import $ from 'jquery';
const to = require('await-to-js').default;

const Data = require('data');
const Utils = require('utils');


class SubjectSelectDialog {

    constructor() {
        this.render = window.app.render;
        this.selected = '';
        this.renderSelf();
    }

    view() {
        $('body').prepend(this.main);
        this.manage();
        this.dialog.open();
    }

    manage() {
        this.dialog = MDCDialog.attachTo(this.main);

        this.main.querySelectorAll('#page-all .mdc-list-item').forEach((el) => {
            $(el).click(() => {
                var id = el.id.split('-').slice(1).join('-');
                this.section(id);
            });
        });

        this.pages.forEach((sel) => {
            var key = sel.id.split('-')[1];
            if (key === 'all') {
                return;
            }

            sel.querySelectorAll('.mdc-list-item').forEach((el) => {
                el.addEventListener('click', () => {
                    this.updateSelected(el.innerText.trim());
                    this.dialog.close();
                    $(this.main).remove();
                });
            });
        });

        this.section('page-all');
    }

    updateSelected(val) {
        this.selected = val;
    }

    section(id) {
        this.pages.forEach((sel) => {
            if (sel.id === id) {
                sel.style.display = 'inherit';
            } else {
                sel.style.display = 'none';
            }
            this.dialog.layout();
        });
    }

    renderSelf() {
        this.main = this.render.template('dialog-subjects');
        this.pages = this.main.querySelectorAll('.page');
        const that = this;

        function l(q, d) { // Replaces listEl (q) with (d) list
            Utils.replaceElement(
                that.main.querySelector(q),
                that.render.template('dialog-filter-item-list', {
                    items: d
                })
            );
        };

        l('#math-list', Data.mathSubjects);
        l('#science-list', Data.scienceSubjects);
        l('#history-list', Data.historySubjects);
        l('#language-list', Data.languageSubjects);
        l('#english-list', Data.englishSubjects);
        l('#life-skills-list', Data.lifeSkills);
    }
};


class EditSubjectDialog extends SubjectSelectDialog {

    constructor(textFieldEl, profile) {
        super();
        this.selected = $(textFieldEl).find('input').val();
        this.input = textFieldEl;
        this.profile = profile;
    }

    updateSelected(val) {
        super.updateSelected();
        $(this.input).find('input').val(val).focus(); // Update the text field
        EditSubjectDialog.updateSubjects(this.profile);
    }

    static async updateSubjects(profile) {
        const user = profile || window.app.user;
        user.subjects = [];
        $('#Subject input').each(function(i) {
            if (Data.subjects.indexOf($(this).val()) >= 0) {
                user.subjects.push($(this).val());
            }
        });
        if (!profile) {
            await window.app.updateUser();
            window.app.snackbar.view('Subjects updated.');
        }
    }
};


class EditAvailabilityDialog {

    constructor(textFieldEl, profile) {
        this.string = $(textFieldEl).find('input').val();
        // parseAvailabilityString throws an Error if the string is empty unless
        // we specify openingDialog=true (last arg given down below).
        this.val = Utils.parseAvailabilityString(this.string, true);
        this.input = textFieldEl;
        this.utils = window.app.utils;
        this.render = window.app.render;
        this.data = window.app.data; // TODO: Update location data?
        this.profile = profile;
        this.renderSelf();
    }

    view() {
        $('body').prepend(this.main);
        this.manage();
        this.dialog.open();
    }

    manage() {
        this.dialog = MDCDialog.attachTo(this.main);
        const that = this;

        function s(q) { // Attach select based on query
            return Utils.attachSelect($(that.main).find(q)[0]);
        };

        function listen(s, action) { // Add change listener
            s.listen('MDCSelect:change', () => {
                action(s);
            });
        };

        function a(q, action) { // Attaches select and adds listener
            listen(s(q), action);
        };

        a('#Location', (s) => {
            this.val.location = s.value;
            this.refreshDaysAndTimes();
        });
        a('#Day', (s) => {
            this.val.day = s.value;
            this.refreshTimes();
        });
        a('#To', (s) => {
            this.val.toTime = s.value;
        });
        a('#From', (s) => {
            this.val.fromTime = s.value;
        });

        this.dialog.listen('MDCDialog:closing', (event) => {
            if (event.detail.action === 'ok') {
                $(this.input).find('input')
                    .val(Utils.getAvailabilityString(this.val)).focus();
                EditAvailabilityDialog.updateAvailability(this.profile);
                $(this.main).remove();
            }
        });
    }

    static async updateAvailability(profile) {
        // NOTE: Availability is stored in the Firestore database as:
        // availability: {
        //   Gunn Library: {
        //     Friday: [
        //       { open: '10:00 AM', close: '3:00 PM' },
        //       { open: '10:00 AM', close: '3:00 PM' },
        //     ],
        //   }
        //   ...
        // };
        // First, create an array of all the displayed availability strings
        var strings = [];
        $('[id="Available"]').each(function(i) {
            if ($(this).find('input').val() !== '') {
                strings.push($(this).find('input').val());
            }
        });

        if (!profile) {
            window.app.user.availability = Utils.parseAvailabilityStrings(strings);
            await window.app.updateUser();
            window.app.snackbar.view('Availability updated.');
        } else {
            profile.availability = Utils.parseAvailabilityStrings(strings);
        }
    }

    refreshTimes() { // Update time selects based on newly selected day
        const location = this.data.locationDataByName[this.val.location];
        const times = this.utils.getLocationTimesByDay(
            this.val.day,
            location.hours
        );
        const that = this;

        if (times.length === 1) { // Only one available option (pre-select it)
            this.val.fromTime = times[0];
            this.val.toTime = times[0];
        } else if (times.length < 1) { // No available options
            return window.app.snackbar.view(location.name + ' does not have ' +
                'any open hours.');
        }

        function s(q) { // Attach select based on query
            return Utils.attachSelect($(that.main).find(q)[0]);
        };

        function listen(s, action) { // Add change listener
            s.listen('MDCSelect:change', () => {
                action(s);
            });
        };

        function a(q, action) { // Attaches select and adds listener
            listen(s(q), action);
        };

        function r(q, el, action) { // Replaces select and adds listener
            $(that.main).find(q).replaceWith(el);
            a(q, action);
        };

        r(
            '#To',
            that.render.select('To', that.val.toTime, times),
            (s) => {
                that.val.toTime = s.value;
            }
        );
        r(
            '#From',
            that.render.select('From', that.val.fromTime, times),
            (s) => {
                that.val.fromTime = s.value;
            }
        );
    }

    refreshDaysAndTimes() { // Update day and time selects based on location
        const location = this.data.locationDataByName[this.val.location];
        const times = this.utils.getLocationTimes(location.hours);
        const days = Utils.getLocationDays(location.hours);
        const that = this;

        if (times.length === 1) { // Only one available option (pre-select it)
            this.val.fromTime = times[0];
            this.val.toTime = times[0];
        }
        if (days.length === 1) { // Only one available option (pre-select it)
            this.val.day = days[0];
        }
        if (times.length < 1 || days.length < 1) { // No available options
            return window.app.snackbar.view(location.name + ' does not have ' +
                'any open hours.');
        }

        function s(q) { // Attach select based on query
            return Utils.attachSelect($(that.main).find(q)[0]);
        };

        function listen(s, action) { // Add change listener
            s.listen('MDCSelect:change', () => {
                action(s);
            });
        };

        function a(q, action) { // Attaches select and adds listener
            listen(s(q), action);
        };

        function r(q, el, action) { // Replaces select and adds listener
            $(that.main).find(q).replaceWith(el);
            a(q, action);
        };

        r(
            '#Day',
            that.render.select('Day', that.val.day, days),
            (s) => {
                that.val.day = s.value;
                that.refreshTimes();
            }
        );
        r(
            '#To',
            that.render.select('To', that.val.toTime, times),
            (s) => {
                that.val.toTime = s.value;
            }
        );
        r(
            '#From',
            that.render.select('From', that.val.fromTime, times),
            (s) => {
                that.val.fromTime = s.value;
            }
        );
    }

    renderSelf() {
        this.main = this.render.template('dialog-form', {
            title: 'Edit Availability'
        });
        const content = this.render.template('input-wrapper');
        const v = this.val;
        const d = this.data;
        const that = this;

        function addS(l, v, d) {
            content.appendChild(that.render.selectItem(l, v, d));
        };

        addS('Location', v.location, d.locationNames);
        addS('Day', v.day, Data.days);
        addS('From', v.fromTime, d.timeStrings);
        addS('To', v.toTime, d.timeStrings);

        $(this.main).find('.mdc-dialog__content').append(content);
    }
};


class NotificationDialog {

    // Renders the dialog with the given message and title
    constructor(title, message, action) {
        this.title = title;
        this.message = message;
        this.action = action || window.app.nav.back;
        this.render = window.app.render;
        this.renderSelf();
    }

    renderSelf() {
        this.el = this.render.template('dialog-notification', {
            title: this.title,
            message: this.message,
        });
    }

    view() {
        $('body').prepend(this.el);
        this.dialog = MDCDialog.attachTo(this.el);
        this.dialog.autoStackButtons = false;
        this.dialog.listen('MDCDialog:closed', (event) => {
            $(this.el).remove();
            this.action();
        });
        this.dialog.open();
    }
};


class ConfirmationDialog {

    // Renders the dialog with the given message and title
    constructor(title, message, action, forceAction) {
        this.forceAction = forceAction;
        this.title = title;
        this.message = message;
        this.action = action || window.app.nav.back;
        this.render = window.app.render;
        this.renderSelf();
    }

    renderSelf() {
        this.el = this.render.template('dialog-confirmation', {
            title: this.title,
            summary: this.message,
        });
    }

    view() {
        $('body').prepend(this.el);
        this.dialog = MDCDialog.attachTo(this.el);
        this.dialog.autoStackButtons = false;
        if (this.forceAction) {
            this.dialog.scrimClickAction = '';
            this.dialog.escapeKeyAction = '';
        }
        this.dialog.listen('MDCDialog:closed', (event) => {
            $(this.el).remove();
            if (event.detail.action === 'yes') {
                this.action();
            }
        });
        this.dialog.open();
    }
};


class ViewRequestDialog {

    // Renders the dialog for the given request
    constructor(request, id) {
        this.request = request;
        this.id = id;
        this.render = window.app.render;
        this.renderSelf();
    }

    renderSelf() {
        const that = this;
        const request = this.request;
        const el = this.render.template('dialog-input');

        function add(e) {
            el.appendChild(e);
        };

        function addT(l, d) {
            add(that.render.textFieldItem(l, d));
        };

        add(this.render.userHeader(
            Utils.getOtherUser(request.fromUser, request.toUser)
        ));
        add(this.render.listDivider('At'));
        addT('Location', request.location.name);
        addT('Day', request.time.day);
        addT('From', request.time.from);
        addT('To', request.time.to);
        add(this.render.listDivider('For'));
        addT('Subject', request.subject);
        add(this.render.textAreaItem('Message', request.message));

        if (request.payment.type === 'Paid') {
            add(this.render.listDivider('Payment'));
            addT('Amount', '$' + request.payment.amount.toFixed(2));
            addT('Payment method', request.payment.method);
        }

        const header = this.render.header('header-action', {
            title: 'View Request',
            edit: () => {
                new EditRequestDialog(this.request, this.id).view();
            },
            showEdit: true,
            print: () => {
                window.app.print();
            },
            showApprove: window.app.user.email === this.request.toUser.email,
            approve: async () => {
                window.app.nav.back();
                await Data.approveRequest(this.request, this.id);
                window.app.snackbar.view('Approved request.');
            },
            cancel: () => {
                window.app.nav.back();
            },
        });

        this.header = header;
        this.main = el;

        return {
            header: this.header,
            main: this.el,
        };
    }

    // Views the dialog and adds manager(s)
    view() {
        window.app.intercom.view(false);
        window.app.view(this.header, this.main);
        this.manage();
    }

    manage() {
        MDCTopAppBar.attachTo(this.header);
        const dialog = this.main;
        // NOTE: We have to attach MDC Components after the view is shown or they
        // do not render correctly.
        dialog.querySelectorAll('.mdc-text-field').forEach((el) => {
            MDCTextField.attachTo(el);
        });

        // Disable all inputs
        ['textarea', 'input'].forEach((input) => {
            dialog.querySelectorAll(input)
                .forEach((el) => {
                    el.setAttribute('disabled', true);
                });
        });
    }
};

class EditRequestDialog {

    // Renders the dialog for the given request
    constructor(request, id) {
        this.request = request;
        this.id = id;
        this.render = window.app.render;
        this.utils = new Utils(); // To use timeString related functions
    }

    async renderSelf(profile) {
        const request = this.request;
        const app = window.app;
        const utils = this.utils;
        const that = this;
        const el = this.render.template('dialog-input');
        const user = profile || await Data.getUser(
            Utils.getOtherUser(request.toUser, request.fromUser).email
        );
        // First, parse the user's availability map into location, day, and 
        // time arrays
        const userLocations = Utils.getUserAvailableLocations(user.availability);
        const userDays =
            (!!request.location && !!request.location.name) ?
            Utils.getUserAvailableDaysForLocation(
                user.availability,
                request.location.name
            ) : Utils.getUserAvailableDays(user.availability);
        const userTimes =
            (!!request.time && !!request.time.day && !!request.location &&
                !!request.location.name) ? utils.getUserAvailableTimesForDay(
                user.availability,
                request.time.day,
                request.location.name,
            ) : utils.getUserAvailableTimes(user.availability);

        // If there are only no options, make sure to tell the user so they don't
        // think that it's a bug (that the only select options are the ones that
        // were already selected).
        if (userLocations.length < 1 && userDays < 1 && userTimes < 1) {
            window.app.snackbar
                .view(user.name + ' does not have any other availability.');
        }

        function add(e) {
            el.appendChild(e);
        };

        function addS(l, v, d) {
            add(that.render.selectItem(l, v, Utils.concatArr([v], d)));
        };

        function addD(l) {
            add(that.render.listDivider(l));
        };

        function addH(profile) {
            add(that.render.userHeader(profile));
        };

        if (window.app.user.type === 'Supervisor') {
            // NOTE: By default we show the toUser's availability for supervisors,
            // and thus this "user" object is the toUser's data.
            const fromUser = await Data.getUser(request.fromUser.email);
            addD('From ' + fromUser.type.toLowerCase());
            addH(fromUser);
            addD('To ' + user.type.toLowerCase());
        };
        addH(user);
        addD('At');
        addS('Location', request.location.name, userLocations);
        addS('Day', request.time.day, userDays);
        addS('From', request.time.from, userTimes);
        addS('To', request.time.to, userTimes);
        addD('For');
        addS('Subject', request.subject, user.subjects);
        add(this.render.textAreaItem('Message', request.message));

        const header = this.render.header('header-action', {
            title: 'Edit Request',
            ok: () => {},
            cancel: () => {
                window.app.nav.back();
            },
        });

        this.header = header;
        this.main = el;
        this.user = user;
    }

    // Views the dialog and adds manager(s)
    async view() {
        await this.renderSelf();
        window.app.intercom.view(false);
        window.app.view(this.header, this.main);
        this.manage();
    }

    async modifyRequest() {
        window.app.nav.back();
        await Data.modifyRequest(this.request, this.id);
        window.app.snackbar.view('Request updated.');
    }

    sendRequest() {} // Added in NewRequestDialog

    updateAmount() {} // Added in PaidRequestDialog

    manage() {
        const availability = this.user.availability;
        const request = this.request;
        const dialog = this.main;
        const that = this;

        // AT
        const locationEl = dialog.querySelector('#Location');
        const locationSelect = Utils.attachSelect(locationEl);
        locationSelect.listen('MDCSelect:change', function() {
            request.location.name = locationSelect.value;
            request.location.id = window.app.data // Only init data once
                .locationsByName[locationSelect.value];
            that.refreshDayAndTimeSelects(request, availability);
        });

        const dayEl = dialog.querySelector('#Day');
        const daySelect = Utils.attachSelect(dayEl);
        daySelect.listen('MDCSelect:change', () => {
            request.time.day = daySelect.value;
            that.refreshTimeSelects(request, availability);
        });

        const fromTimeEl = dialog.querySelector('#From');
        const fromTimeSelect = Utils.attachSelect(fromTimeEl);
        fromTimeSelect.listen('MDCSelect:change', () => {
            request.time.from = fromTimeSelect.value;
            that.updateAmount();
        });

        const toTimeEl = dialog.querySelector('#To');
        const toTimeSelect = Utils.attachSelect(toTimeEl);
        toTimeSelect.listen('MDCSelect:change', () => {
            request.time.to = toTimeSelect.value;
            that.updateAmount();
        });

        // FOR
        const subjectEl = dialog.querySelector('#Subject');
        const subjectSelect = Utils.attachSelect(subjectEl);
        subjectSelect.listen('MDCSelect:change', function() {
            request.subject = subjectSelect.value;
        });

        const messageEl = dialog.querySelector('#Message');
        const messageTextField = MDCTextField.attachTo(messageEl);

        // Only update or send request when the check button is clicked
        MDCTopAppBar.attachTo(this.header);
        document.querySelector('.header #ok').addEventListener('click', () => {
            request.message = messageTextField.value;
            that.modifyRequest();
        });
        document.querySelector('.header #send').addEventListener('click', () => {
            request.message = messageTextField.value;
            that.sendRequest();
        });
    }

    refreshDayAndTimeSelects(request, a) {
        var that = this;
        var days = Utils.getUserAvailableDaysForLocation(a, request.location.name);
        var times = this.utils.getUserAvailableTimesForDay(
            a,
            days[0],
            request.location.name
        );

        if (times.length === 1) {
            request.time.from = times[0];
            request.time.to = times[0];
        }
        if (days.length === 1) {
            request.time.day = days[0];
        }

        // If there are only no options, make sure to tell the user so they don't
        // think this it's a bug (this the only select options are the ones this
        // were already selected).
        if (days.length < 1 && times.length < 1) {
            window.app.snackbar.view(request.toUser.name + ' does not have any ' +
                'availability at the ' + request.location.name + '.');
            return;
        }

        var toTimeEl = this
            .render.select('To', request.time.to || '', times)
        var oldToTimeEl = document.querySelector('main .dialog-input')
            .querySelector('#To');
        oldToTimeEl.parentNode.insertBefore(toTimeEl, oldToTimeEl);
        oldToTimeEl.parentNode.removeChild(oldToTimeEl);
        var toTimeSelect = Utils.attachSelect(toTimeEl);
        toTimeSelect.listen('MDCSelect:change', function() {
            request.time.to = toTimeSelect.value;
            that.updateAmount();
        });

        var dayEl = this
            .render.select('Day', request.time.day || '', days);
        var oldDayEl = document.querySelector('main .dialog-input')
            .querySelector('#Day');
        oldDayEl.parentNode.insertBefore(dayEl, oldDayEl);
        oldDayEl.parentNode.removeChild(oldDayEl);
        var daySelect = Utils.attachSelect(dayEl);
        daySelect.listen('MDCSelect:change', function() {
            request.time.day = daySelect.value;
            that.refreshTimeSelects(request, a);
        });
    }

    refreshTimeSelects(request, a) {
        var that = this;
        var times = this.utils.getUserAvailableTimesForDay(
            a,
            request.time.day,
            request.location.name
        );

        if (times.length === 1) {
            request.time.from = times[0];
            request.time.to = times[0];
        }

        // If there are only no options, make sure to tell the user so they don't
        // think this it's a bug (this the only select options are the ones this
        // were already selected).
        if (times.length < 1) {
            window.app.snackbar.view(request.toUser.name + ' does not have any ' +
                'availability on ' + request.day + 's.');
            return;
        }

        var toTimeEl = this
            .render.select('To', request.time.to || '', times)
        var oldToTimeEl = document.querySelector('main .dialog-input')
            .querySelector('#To');
        oldToTimeEl.parentNode.insertBefore(toTimeEl, oldToTimeEl);
        oldToTimeEl.parentNode.removeChild(oldToTimeEl);
        var toTimeSelect = Utils.attachSelect(toTimeEl);
        toTimeSelect.listen('MDCSelect:change', function() {
            request.time.to = toTimeSelect.value;
            that.updateAmount();
        });

        var fromTimeEl = this
            .render.select('From', request.time.from || '', times);
        var oldFromTimeEl = document.querySelector('main .dialog-input')
            .querySelector('#From');
        oldFromTimeEl.parentNode.insertBefore(fromTimeEl, oldFromTimeEl);
        oldFromTimeEl.parentNode.removeChild(oldFromTimeEl);
        var fromTimeSelect = Utils.attachSelect(fromTimeEl);
        fromTimeSelect.listen('MDCSelect:change', function() {
            request.time.from = fromTimeSelect.value;
            that.updateAmount();
        });
    }
};


class NewRequestDialog extends EditRequestDialog {

    // Creates editRequestDialog based on the given subject and toUser
    constructor(subject, user) {
        const utils = new Utils();
        const request = {
            'subject': subject,
            'fromUser': window.app.conciseUser,
            'toUser': Utils.filterRequestUserData(user),
            'timestamp': new Date(),
            'location': {
                name: '',
                id: '',
            },
            'message': '',
            'time': {
                day: '',
                from: '',
                to: '',
            },
            'payment': {
                type: user.payments.type || 'Free',
                method: 'PayPal',
                amount: 0,
            },
        };
        // Check to see if we can pre-select for the user
        const locations = Utils.getUserAvailableLocations(user.availability);
        const days = Utils.getUserAvailableDays(user.availability);
        const times = utils.getUserAvailableTimes(user.availability);
        if (locations.length === 1) {
            request.location.name = locations[0];
            request.location.id =
                window.app.data.locationsByName[request.location.name];
        }
        if (times.length === 1) {
            request.time.from = times[0];
            request.time.to = times[0];
        }
        if (days.length === 1) {
            request.time.day = days[0];
        }

        // No options for the user to select
        if (locations.length < 1 && days.length < 1 && times.length < 1) {
            window.app.snackbar.view(user.name + ' does not have any availability.');
            throw new Error(user.name + ' does not have any availability.');
        }

        super(request, Utils.genID());
        this.user = user; // Cannot reference `this` until after super();
    }

    async renderSelf() {
        await super.renderSelf(this.user);
        this.header = this.render.header('header-action', { // Override header
            title: 'New Request',
            send: () => {},
            cancel: () => {
                window.app.nav.back();
            },
        });
    }

    manage() {
        super.manage();
    }

    async sendRequest() { // Override modify to create a new request
        window.app.nav.back();
        await Data.newRequest(this.request, this.payment);
        window.app.snackbar.view(
            'Request sent to ' + this.request.toUser.email + '.',
            'Undo',
            async () => {
                window.app.snackbar.closeUndo();
                await Data.deleteRequest(this.request);
                window.app.snackbar.view('Canceled request.');
            },
        );
    }
};


class PaidRequestDialog extends NewRequestDialog {

    constructor(subject, user) {
        super(subject, user);
        if (user.payments.type !== 'Paid') {
            console.warn('PaidRequestDialog was passed a user that isn\'t ' +
                'supposed to be paid.');
        }
        this.request.payment.type = 'Paid';
        this.payment = {
            to: this.request.toUser,
            from: this.request.fromUser,
            amount: this.getAmount(),
            timestamp: new Date(),
            for: this.request,
            id: this.id || '',
            method: 'PayPal',
        };
    }

    async sendRequest() {
        if (!this.payment.transaction) {
            window.app.snackbar.view('Please add a valid payment method.');
            return;
        }
        await super.sendRequest();
    }

    async renderSelf() {
        await super.renderSelf();
        this.renderPayments();
        this.updateAmount();
    }

    renderPayments() {
        $(this.main).append(this.render.listDivider('Payment'));
        $(this.main).append(this.render.textFieldItem('Amount', '$0.00'));
        $(this.main).append(this.render.paypalButtonsItem());
    }

    getAmount() {
        // Get the duration between the the from and to times
        const hours = window.app.utils.getHoursFromStrings(
            this.request.time.from,
            this.request.time.to
        );
        // And multiply it by the hourly charge
        return this.request.toUser.hourlyCharge * hours;
    }

    updateAmount() {
        this.payment.amount = this.getAmount();
        this.request.payment.amount = this.getAmount();
        $(this.main).find('#Amount input')
            .attr('value', '$' + this.payment.amount.toFixed(2));
    }

    manage() {
        super.manage();
        this.managePayments();
    }

    managePayments() {
        const that = this;
        const amountEl = $(this.main).find('#Amount')[0];
        const amountTextField = MDCTextField.attachTo(amountEl);
        $(amountEl).find('input').attr('disabled', 'disabled');

        if (!window.app.onMobile) {
            const descriptionEl = $(this.main)
                .find('[id="Authorize payment"]')[0];
            const descriptionTextArea = MDCTextField.attachTo(descriptionEl);
            $(descriptionEl).find('textarea').attr('disabled', 'disabled');
        }

        paypal.Buttons({
            createOrder: (data, actions) => {
                // Set up the transaction
                return actions.order.create({
                    purchase_units: [{
                        amount: {
                            // TODO: Right now, we're only going to authorize for
                            // one, one hour lesson and then show another prompt once
                            // the tutor clocksOut asking if they want another.
                            value: that.payment.amount
                        }
                    }]
                }).catch((err) => {
                    console.error('Error while creating PayPal order:', err);
                    window.app.snackbar.view('Could not add payment. Please ' +
                        'ensure that you\'ve selected a valid time range.');
                });
            },
            onApprove: (data, actions) => {
                return actions.order.authorize().then((auth) => {
                    // NOTE: All we need to be able to capture this auth later
                    // is this id. Also note that this auth period is only 29
                    // days.
                    var authID = auth.purchase_units[0].payments.authorizations[0].id;
                    that.payment.transaction = auth;
                    that.payment.authID = authID;
                    window.app.snackbar.view('Added payment method.')
                    // Call your server to save the transaction
                    // We'll use Firestore here to process the transaction
                    // by adding a payment document in this user's
                    // subcollections.
                });
            },
        }).render('#paypal-buttons');
    }
};


class StripeRequestDialog extends PaidRequestDialog {

    constructor(subject, user) {
        super(subject, user);
        this.request.payment.method = 'Stripe';
        this.payment = {
            to: this.request.toUser,
            from: this.request.fromUser,
            amount: this.getAmount(),
            for: this.request,
            timestamp: new Date(),
            method: 'Stripe',
        };
        this.stripe = Stripe('pk_live_rospM71ihUDYWBArO9JKmanT00L5dZ36vA');
    }

    async sendRequest() {
        const res = await this.stripe.createToken(this.card);
        if (res.error) {
            $(this.main).find('#Method')[0].scrollIntoView({
                behavior: 'smooth'
            });
            return window.app.snackbar.view(res.error.message);
        }
        this.payment.transaction = res.token;
        super.sendRequest();
    }

    renderPayments() {
        $(this.main).append(this.render.listDivider('Payment'));
        $(this.main).append(this.render.textFieldItem('Amount', '$0.00'));
        $(this.main).append(this.render.template('stripe-card-input'));
        // TODO: Show the tutor's payment policy here?
    }

    managePayments() {
        const amountEl = $(this.main).find('#Amount')[0];
        const amountTextField = MDCTextField.attachTo(amountEl);
        window.amountTextField = amountTextField;
        $(amountEl).find('input').attr('disabled', 'disabled');

        const methodEl = $(this.main).find('#Method')[0];

        function showErr(err) {
            $(methodEl).find('.mdc-text-field-helper-text')
                .text(err.message)
                .addClass('mdc-text-field-helper-text--validation-msg');
            $(methodEl).find('.mdc-text-field-helper-line')
                .attr('style', 'visiblity:visible;');
            $(methodEl).find('.mdc-text-field')
                .addClass('mdc-text-field--invalid');
            $(methodEl).find('.mdc-floating-label')
                .addClass('mdc-floating-label--shake');
        };

        function hideErr() {
            $(methodEl).find('.mdc-text-field-helper-line')
                .attr('style', 'visibility:hidden;');
            $(methodEl).find('.mdc-text-field')
                .removeClass('mdc-text-field--invalid');
            $(methodEl).find('.mdc-floating-label')
                .removeClass('mdc-floating-label--shake');
        };

        const elements = this.stripe.elements();
        const style = {
            base: { // Comes from MDCTextField styling
                fontSize: '16px',
                fontFamily: '"Roboto", sans-serif',
                fontSmoothing: 'antialiased',
                '::placeholder': {
                    color: '#676767',
                },
                letterSpacing: '0.00937em',
            },
            invalid: {
                color: '#B00020',
                iconColor: '#B00020',
            },
        };
        this.card = elements.create('card', {
            style
        });
        this.card.mount($(this.main).find('#card-input')[0]);
        this.card.addEventListener('change', (event) => {
            if (event.error) {
                showErr(event.error);
            } else {
                hideErr();
            }
        });
    }
};


class ViewApptDialog extends ViewRequestDialog {
    constructor(appt, id) {
        super(appt.for, id);
        this.appt = appt;
    }

    renderSelf() {
        super.renderSelf();
        if (window.app.user.type === 'Tutor') {
            if (this.request.payment.type === 'Paid') {
                $(this.main).append(this.render.fab('requestPayment'));
            } else {
                $(this.render.listDivider('Hours clocked'))
                    .insertAfter($(this.main).find('.user-header'));
                $(this.render.splitListItem(
                    this.render.textField('Current', '0:0:0.00'),
                    this.render.textField('Total', '0:0:0.00')
                )).insertAfter($(this.main).find('[id="Hours clocked"]'));
                $(this.main).append(this.render.fab('clockIn'));
            }
        }
        this.header = this.render.header('header-action', {
            showEdit: true,
            edit: () => {
                new EditApptDialog(this.appt, this.id).view();
            },
            print: () => {
                window.app.print();
            },
            cancel: () => {
                window.app.nav.back();
            },
            title: 'Upcoming Appointment',
        });
    }

    manage() {
        super.manage();
        $(this.main).find('.mdc-fab').each(function() {
            MDCRipple.attachTo(this);
        });
        if (window.app.user.type === 'Tutor') {
            if (this.request.payment.type === 'Paid') {
                $(this.main).find('.mdc-fab').click(async () => {
                    var err;
                    var res;
                    [err, res] = await to(
                        Data.requestPaymentFor(this.appt, this.id)
                    );
                    if (err) return window.app.snackbar.view('Could not send ' +
                        'payment request. Please ensure this isn\'t a ' +
                        'duplicate request.');
                    window.app.snackbar.view('Sent payment request to ' +
                        Utils.getOther(this.appt.attendees).email + '.');
                });
            } else {
                $(this.main).find('.mdc-fab').click(() => {
                    if (!this.timer) {
                        this.clockIn();
                        $(this.main).find('.mdc-fab__label').text('ClockOut');
                    } else {
                        this.clockOut();
                        $(this.main).find('.mdc-fab__label').text('ClockIn');
                    }
                });
            }
        }
    }

    async clockIn() {
        this.timer = setInterval(this.update, 10);
        await Data.clockIn(this.appt, this.id);
        window.app.snackbar.view('Sent clock in request.');
        $(this.header).find('.material-icons').off('click').click(() => {
            window.app.snackbar.view('Navigation is locked until you clock out.');
        });
    }

    async clockOut() {
        clearInterval(this.timer);
        this.timer = null;
        await Data.clockOut(this.appt, this.id);
        window.app.snackbar.view('Sent clock out request.');
    }

    update() {
        // Formatted as: Hr:Min:Sec.Millisec
        var currentTimeDisplay = $('#Current input')[0];
        var current = currentTimeDisplay.value.toString();
        var currentHours = new Number(current.split(':')[0]);
        var currentMinutes = new Number(current.split(':')[1]);
        var currentSeconds = new Number(current.split(':')[2].split('.')[0]);
        var currentMilli = new Number(current.split('.')[1]) || 0;

        // Add to currentMilli
        currentMilli++;

        // Parse the current values to ensure they are formatted correctly
        if (currentMilli === 100) {
            currentMilli = 0;
            currentSeconds++;
        }
        if (currentSeconds === 60) {
            currentSeconds = 0;
            currentMinutes++;
        }
        if (currentMinutes === 60) {
            currentMinutes = 0;
            currentHours++;
        }

        currentTimeDisplay.value = currentHours + ':' + currentMinutes +
            ':' + currentSeconds + '.' + currentMilli;

        // Next, update the total time
        // Formatted as: Hr:Min:Sec.Millisec
        var totalTimeDisplay = $('#Total input')[0];
        var total = totalTimeDisplay.value.toString();
        var totalHours = new Number(total.split(':')[0]);
        var totalMinutes = new Number(total.split(':')[1]);
        var totalSeconds = new Number(total.split(':')[2].split('.')[0]);
        var totalMilli = new Number(total.split('.')[1]);

        // Add to totalMilli
        totalMilli++;

        // Parse the total values to ensure they are formatted correctly
        if (totalMilli === 100) {
            totalMilli = 0;
            totalSeconds++;
        }
        if (totalSeconds === 60) {
            totalSeconds = 0;
            totalMinutes++;
        }
        if (totalMinutes === 60) {
            totalMinutes = 0;
            totalHours++;
        }

        totalTimeDisplay.value = totalHours + ':' + totalMinutes +
            ':' + totalSeconds + '.' + totalMilli;
    }
};

class EditApptDialog extends EditRequestDialog {
    constructor(appt, id) {
        super(appt.for, id);
        this.appt = window.app;
    }

    async renderSelf() {
        await super.renderSelf();
        this.header = this.render.header('header-action', {
            title: 'Edit Appointment',
            ok: async () => {
                window.app.nav.back();
                await Data.modifyAppt(this.appt, this.id);
                window.app.snackbar.view('Modified window.app.intment.');
            },
            cancel: () => {
                window.app.nav.back();
            },
        });
    }
};

class ViewPastApptDialog extends ViewApptDialog {
    constructor(appt, id) {
        super(appt, id);
    }

    renderSelf() {
        super.renderSelf();
        this.header = this.render.header('header-action', {
            title: 'Past Appointment',
        });
    }
};

class ViewActiveApptDialog extends ViewApptDialog {
    constructor(appt, id) {
        super(appt, id);
    }

    renderSelf() {
        super.renderSelf();
        this.header = this.render.header('header-action', {
            title: 'Active Appointment',
        });
        $(this.main).find('.mdc-fab__label').text('ClockOut');
    }
};

module.exports = {
    viewRequest: ViewRequestDialog,
    editRequest: EditRequestDialog,
    newRequest: NewRequestDialog,
    paidRequest: PaidRequestDialog,
    stripeRequest: StripeRequestDialog,
    viewAppt: ViewApptDialog,
    editAppt: EditApptDialog,
    viewPastAppt: ViewPastApptDialog,
    viewActiveAppt: ViewActiveApptDialog,
    notify: NotificationDialog,
    editSubject: EditSubjectDialog,
    selectSubject: SubjectSelectDialog,
    editAvailability: EditAvailabilityDialog,
    confirm: ConfirmationDialog,
};
/**
 * Package that contains the user views from Tutorbook's web app.
 * @module @tutorbook/user
 * @see {@link https://npmjs.com/package/@tutorbook/user}
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

import { MDCRipple } from '@material/ripple/index';
import { MDCTopAppBar } from '@material/top-app-bar/index';

import * as $ from 'jquery';

import {
  NewRequestDialog,
  PaidRequestDialog,
  StripeRequestDialog,
} from '@tutorbook/dialogs';
import Utils from '@tutorbook/utils';
import Data from '@tutorbook/data';

/**
 * Class that represents the user view in Tutorbook's web app.
 * @todo Make this more like a CRM user view for supervisors (e.g. show all of
 * the user's appointments, recent messages, pending requests, etc).
 * @todo Make the user view check if anything has changed in it's `this.profile`
 * {@link Profile} object before viewing. If there has been changes, make sure to
 * re-render the user view to show them.
 * @todo Finish documenting the rest of this class's methods.
 */
export default class User {
  /**
   * Creates and renders a new user view for a given profile.
   * @param {Profile} profile - The profile to render into a user view.
   */
  constructor(profile) {
    this.render = app.render;
    profile.availableTimes = Utils.getAvailabilityStrings(profile.availability);
    if (profile.payments.type === 'Paid') {
      profile.paid = true;
      profile.showAbout = true;
      profile.showLocation = true;
    } else {
      profile.free = true;
    }
    this.profile = profile;
    this.renderSelf();
  }

  /**
   * Views a user based on a given user ID by:
   * 1. Checks if our [search screen]{@linkplain Search} has already rendered
   * a user view for the requested user and stored it in
   * `window.app.search.users`.
   * 2. If so, we just view that. If not, we create a new user view.
   */
  static async viewUser(id) {
    const users = window.app.search.users;
    if (!users[id]) {
      const p = await Data.getUser(id);
      users[id] = new User(p);
    }
    return users[id].view();
  }

  /**
   * Renders the user view (as usual, using the `window.app.render` instance).
   * @see {@link Render}
   */
  renderSelf() {
    this.main = this.render.template(
      'user-view',
      Utils.combineMaps(this.profile, {
        rate: '$' + this.profile.payments.hourlyCharge,
        paid: this.profile.payments.type === 'Paid',
        free: this.profile.payments.type === 'Free',
      })
    );

    this.header = this.render.header('header-back', {
      title: 'View User',
      showEdit:
        window.app.user.type === 'Supervisor' &&
        this.profile.payments.type === 'Free',
      edit: () => {
        new window.app.EditProfile(this.profile).view();
      },
      showMatch:
        window.app.user.type === 'Supervisor' &&
        this.profile.payments.type === 'Free',
      match: () => {
        Data.updateUser(
          Utils.combineMaps(this.profile, {
            proxy: [window.app.user.uid],
          })
        );
        new window.app.MatchingDialog(this.profile).view();
      },
    });
  }

  /**
   * Views (and manages) the user view (and hides the Intercom Messenger).
   * @see {Tutorbook#view}
   */
  view() {
    window.app.intercom.view(false);
    window.app.view(this.header, this.main, '/app/users/' + this.profile.uid);
    !this.managed ? this.manage() : null;
  }

  reView() {}

  manage() {
    this.managed = true;

    // GOOGLE MAP
    if (this.profile.payments.type === 'Paid') {
      const first =
        Object.entries(this.profile.availability).length > 0
          ? Object.entries(this.profile.availability)[0][0]
          : window.app.location.name;
      if (Data.locations.indexOf(first) >= 0) {
        var addr = Data.addresses[first];
      } else {
        var addr = first;
      }
      new google.maps.Geocoder().geocode(
        {
          address: addr,
        },
        (res, status) => {
          if (status === 'OK') {
            const geo = res[0].geometry.location;
            var latLang = {
              lat: geo.lat(),
              lng: geo.lng(),
            };
          } else {
            // Gunn Academic Center
            var latLang = {
              lat: 37.400222,
              lng: -122.132488,
            };
          }
          const map = new google.maps.Map($(this.main).find('#map')[0], {
            zoom: 15,
            center: latLang,
          }); // TODO: Add markers for all the user's locations
          const marker = new google.maps.Marker({
            position: latLang,
            map: map,
            title: 'Tutors Here',
          });
        }
      );
    }

    // SUBJECTS
    this.main.querySelectorAll('#subjects .mdc-list-item').forEach((el) => {
      MDCRipple.attachTo(el);
      el.addEventListener('click', () => {
        if (window.app.user.type === 'Supervisor')
          return new window.app.MatchingDialog(this.profile, {
            subject: el.innerText,
          }).view();
        if (this.profile.payments.type === 'Paid')
          return new StripeRequestDialog(el.innerText, this.profile).view();
        return new NewRequestDialog(el.innerText, this.profile).view();
      });
    });

    // MESSAGE FAB
    const messageFab = this.main.querySelector('#message-button');
    MDCRipple.attachTo(messageFab);
    messageFab.addEventListener('click', async () => {
      return (await window.app.chats.newWith(this.profile)).view();
    });

    // REQUEST FAB
    const requestFab = this.main.querySelector('#request-button');
    MDCRipple.attachTo(requestFab);
    requestFab.addEventListener('click', () => {
      if (this.profile.payments.type === 'Paid') {
        return new StripeRequestDialog('', this.profile).view();
      }
      return new NewRequestDialog('', this.profile).view();
    });

    // HEADER
    MDCTopAppBar.attachTo(this.header);
  }
}

/**
 * Package that defines the `site-footer` custom HTML Web Component.
 * @module @tutorbook/footer
 * @see {@link https://npmjs.com/package/@tutorbook/footer}
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

import * as html from './index.html';
import * as css from './index.scss';

/**
 * Class that defines the `site-footer` custom HTML Web Component that is used
 * at the bottom of every page of our marketing site.
 * @extends external:HTMLElement
 */
export default class Footer extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({
      mode: 'open',
    });
    shadow.innerHTML = '<style>' + css + '</style>' + html;
  }
}

window.customElements.define('site-footer', Footer);

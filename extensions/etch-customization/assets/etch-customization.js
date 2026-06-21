(function () {
  'use strict';

  function initBlock(container) {
    var shop = container.dataset.shop;
    var productId = container.dataset.productId;
    var appUrl = (container.dataset.appUrl || '').replace(/\/$/, '');
    var loadingEl = container.querySelector('.etch-customization__loading');
    var fieldsEl = container.querySelector('.etch-customization__fields');
    var errorEl = container.querySelector('.etch-customization__error');
    var priceEl = container.querySelector('.etch-customization__price');

    if (!shop || !productId || !appUrl) {
      container.hidden = true;
      return;
    }

    var configUrl =
      appUrl +
      '/api/preview?shop=' +
      encodeURIComponent(shop) +
      '&productId=' +
      encodeURIComponent(productId);

    fetch(configUrl)
      .then(function (res) {
        if (res.status === 404) {
          // Product has no published config — hide block silently
          container.hidden = true;
          return null;
        }
        if (!res.ok) throw new Error('Config fetch failed: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        if (!data.fields || data.fields.length === 0) {
          container.hidden = true;
          return;
        }
        loadingEl.hidden = true;
        renderFields(container, data.fields, shop, productId, appUrl, fieldsEl, priceEl, errorEl);
        fieldsEl.hidden = false;
      })
      .catch(function () {
        loadingEl.hidden = true;
        errorEl.textContent = 'Customization options are temporarily unavailable.';
        errorEl.hidden = false;
      });
  }

  function renderFields(container, fields, shop, productId, appUrl, fieldsEl, priceEl, errorEl) {
    var blockId = container.id;
    var heading = container.dataset.heading;

    if (heading) {
      var h = document.createElement('h3');
      h.className = 'etch-customization__heading';
      h.textContent = heading;
      fieldsEl.appendChild(h);
    }

    var breakdownEl = document.createElement('div');
    breakdownEl.className = 'etch-customization__breakdown';
    breakdownEl.setAttribute('aria-live', 'polite');
    breakdownEl.hidden = true;
    container.appendChild(breakdownEl);

    // null until first successful price response — cart button stays disabled until set
    var latestPriceData = null;

    // Per-field validity. All start true; button disabled because latestPriceData is null.
    var validityMap = {};
    fields.forEach(function (f) { validityMap[f.id] = true; });

    var cartBtn = findCartButton();
    var productForm = cartBtn ? cartBtn.closest('form') : null;

    // Inject hidden inputs into the product form directly — the block element may be
    // rendered outside the <form> tag in the theme, so inputs inside it won't submit.
    var formTarget = productForm || container;

    // Pricing snapshot — underscore prefix hides from customer-facing UI
    // but remains visible in the merchant's admin order view.
    // The Cart Transform function reads these to enforce the correct price.
    var snapMinorInput = makeHiddenInput('properties[_etch_price_minor]', '');
    var snapPriceInput = makeHiddenInput('properties[_etch_price]', '');
    var snapAtInput = makeHiddenInput('properties[_etch_calculated_at]', '');
    // Per-field/per-group pricing breakdown, with field labels resolved at
    // submit time so the admin order view can render it without looking up
    // customization fields that may since have changed or been deleted.
    var snapBreakdownInput = makeHiddenInput('properties[_etch_breakdown]', '');
    // Snapshot ID identifying which pricing config (fields + rules) produced
    // this price — lets support trace a disputed price back to the rules
    // that were live at purchase time, even if they've since changed.
    var snapVersionInput = makeHiddenInput('properties[_etch_rule_version]', '');
    // Correlation ID generated once per customization session — threaded
    // through /api/preview, /api/log, and the checkout functions so support
    // can follow a single customer's journey across all four logs (SL-31).
    var correlationId = generateCorrelationId();
    var snapCorrelationInput = makeHiddenInput('properties[_etch_correlation_id]', correlationId);
    formTarget.appendChild(snapMinorInput);
    formTarget.appendChild(snapPriceInput);
    formTarget.appendChild(snapAtInput);
    formTarget.appendChild(snapBreakdownInput);
    formTarget.appendChild(snapVersionInput);
    formTarget.appendChild(snapCorrelationInput);

    function updateBtn() {
      if (!cartBtn) return;
      var hasFieldErrors = Object.keys(validityMap).some(function (id) { return !validityMap[id]; });
      // Keep disabled until we have a price — avoids submitting without a snapshot
      var disable = hasFieldErrors || latestPriceData === null;
      cartBtn.disabled = disable;
      cartBtn.setAttribute('aria-disabled', String(disable));
    }

    // Called by fetchPreview on every successful price response
    function onPriceUpdate(data) {
      latestPriceData = data;
      snapMinorInput.value = String(data.price);
      snapPriceInput.value = data.priceFormatted;
      snapAtInput.value = new Date().toISOString();
      snapBreakdownInput.value = data.breakdown
        ? JSON.stringify(resolveBreakdownLabels(data.breakdown, fields))
        : '';
      snapVersionInput.value = data.configVersion || '';
      updateBtn();
    }

    // Guard against edge cases where the button somehow submits without a snapshot
    if (productForm) {
      productForm.addEventListener('submit', function (e) {
        if (latestPriceData === null) {
          e.preventDefault();
          errorEl.textContent = 'Pricing is still loading — please wait a moment before adding to cart.';
          errorEl.hidden = false;
          return;
        }
        logAddToCart(shop, productId, appUrl, correlationId, inputMap);
      });
    }

    var inputMap = {};
    var fieldErrorEls = {};

    fields.forEach(function (field) {
      var uid = 'etch-' + blockId + '-' + field.id;
      var errorId = uid + '-error';
      var wrapper = document.createElement('div');
      wrapper.className = 'etch-customization__field';

      // <label>
      var label = document.createElement('label');
      label.htmlFor = uid;
      label.className = 'etch-customization__label';
      label.textContent = field.label;

      // <input>
      var input = document.createElement('input');
      input.type = 'text';
      input.id = uid;
      input.className = 'etch-customization__input';
      // Hidden mirror inside the product form — submits the value even if the block is outside <form>
      var hiddenFieldInput = makeHiddenInput('properties[' + field.label + ']', '');
      formTarget.appendChild(hiddenFieldInput);
      if (field.maxChars) input.maxLength = field.maxChars;
      var describedBy = errorId;

      // Character-count hint
      var hint = document.createElement('span');
      hint.id = uid + '-hint';
      hint.className = 'etch-customization__hint';
      hint.setAttribute('aria-live', 'polite');
      if (field.maxChars) {
        hint.textContent = '0 / ' + field.maxChars + ' characters';
        describedBy = hint.id + ' ' + errorId;
      }
      input.setAttribute('aria-describedby', describedBy);

      // Per-field validation error element
      var fieldError = document.createElement('span');
      fieldError.id = errorId;
      fieldError.className = 'etch-customization__field-error';
      fieldError.setAttribute('role', 'alert');
      fieldError.hidden = true;
      fieldErrorEls[field.id] = fieldError;

      input.addEventListener('input', function () {
        var len = Array.from(input.value).length; // codepoint count
        if (field.maxChars) hint.textContent = len + ' / ' + field.maxChars + ' characters';

        // Client-side validation — mirrors server-side normalizeInput exactly
        var errors = validateField(input.value, field);
        if (errors.length > 0) {
          fieldError.textContent = errors[0];
          fieldError.hidden = false;
          input.setAttribute('aria-invalid', 'true');
          validityMap[field.id] = false;
        } else {
          fieldError.hidden = true;
          fieldError.textContent = '';
          input.removeAttribute('aria-invalid');
          validityMap[field.id] = true;
        }
        updateBtn();

        hiddenFieldInput.value = input.value;
        inputMap[field.id] = input.value;
        // Keep the bundled JSON attribute in sync so the Cart Transform function
        // can read all field values via a single attribute(key: "_etch_inputs") query.
        etchInputsEl.value = JSON.stringify(inputMap);
        schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId);
      });

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      wrapper.appendChild(hint);
      wrapper.appendChild(fieldError);
      fieldsEl.appendChild(wrapper);

      inputMap[field.id] = '';
    });

    // Bundled JSON attribute read by the Cart Transform function via
    // attribute(key: "_etch_inputs"). Created after forEach so inputMap has
    // all initial empty values. The input event handler above keeps it in sync.
    var etchInputsEl = makeHiddenInput('properties[_etch_inputs]', JSON.stringify(inputMap));
    formTarget.appendChild(etchInputsEl);

    // Initial button state: disabled until price loads
    updateBtn();

    fetchPreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId);
  }

  // RFC 4122-ish v4 UUID, with a non-crypto fallback for older browsers.
  function generateCorrelationId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Fire-and-forget log of an add-to-cart event for an Etch-customized line —
  // lets support trace this customer's journey via correlationId across
  // /api/preview, this event, and the checkout function logs (SL-31).
  function logAddToCart(shop, productId, appUrl, correlationId, inputMap) {
    var payloadSize = 0;
    Object.keys(inputMap).forEach(function (key) {
      payloadSize += (inputMap[key] || '').length;
    });
    var body = JSON.stringify({
      shop: shop,
      productId: productId,
      correlationId: correlationId,
      payloadSize: payloadSize,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(appUrl + '/api/log', new Blob([body], { type: 'application/json' }));
    } else {
      fetch(appUrl + '/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(function () {});
    }
  }

  function makeHiddenInput(name, value) {
    var el = document.createElement('input');
    el.type = 'hidden';
    el.name = name;
    el.value = value;
    return el;
  }

  // Tries common Dawn and theme selectors in order
  function findCartButton() {
    return (
      document.querySelector('[name="add"]') ||
      document.querySelector('.product-form__submit') ||
      document.querySelector('form[action*="cart/add"] button[type="submit"]')
    );
  }

  // Mirrors server-side normalizeInput: trim, collapse whitespace, then validate.
  // Must stay in sync with app/utils/normalize.ts.
  function validateField(value, field) {
    var normalized = value.trim().replace(/\s+/g, ' ');
    var chars = Array.from(normalized); // codepoint-aware — correct for emoji
    var count = chars.length;
    var errors = [];

    if (field.minChars && count < field.minChars) {
      errors.push('Enter at least ' + field.minChars + ' character' + (field.minChars === 1 ? '' : 's') + '.');
    }
    if (field.maxChars && count > field.maxChars) {
      errors.push('Maximum ' + field.maxChars + ' characters allowed.');
    }
    if (field.allowedChars) {
      var allowed = new Set(Array.from(field.allowedChars));
      var bad = new Set();
      chars.forEach(function (c) { if (c !== ' ' && !allowed.has(c)) bad.add(c); });
      if (bad.size > 0) {
        var badArr = Array.from(bad);
        errors.push(badArr.join(', ') + ' character' + (badArr.length === 1 ? '' : 's') + ' not allowed');
      }
    }
    if (field.disallowedChars) {
      var disallowedSet = new Set(Array.from(field.disallowedChars));
      var found = new Set();
      chars.forEach(function (c) { if (disallowedSet.has(c)) found.add(c); });
      if (found.size > 0) {
        var foundArr = Array.from(found);
        errors.push(foundArr.join(', ') + ' character' + (foundArr.length === 1 ? '' : 's') + ' not allowed');
      }
    }
    return errors;
  }

  var debounceTimer;
  function schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      fetchPreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId);
    }, 350);
  }

  function fetchPreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId) {
    priceEl.textContent = 'Calculating…';
    priceEl.hidden = false;

    fetch(appUrl + '/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop: shop, productId: productId, fields: inputMap, correlationId: correlationId }),
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) {
          priceEl.hidden = true;
          breakdownEl.hidden = true;
          return;
        }
        priceEl.textContent = 'Customization: ' + data.priceFormatted;
        priceEl.hidden = false;
        if (data.breakdown) renderBreakdown(data.breakdown, fields, breakdownEl);
        // Server-side validation errors surface in errorEl. With a single
        // field, the "<label>: " prefix is redundant — strip it so the
        // message isn't shown twice (once here, once in fieldError).
        if (!data.valid && data.errors.length > 0) {
          var displayErrors = data.errors;
          if (fields.length === 1) {
            var prefix = fields[0].label + ': ';
            displayErrors = displayErrors.map(function (e) {
              return e.indexOf(prefix) === 0 ? e.slice(prefix.length) : e;
            });
          }
          errorEl.textContent = displayErrors.join(' ');
          errorEl.hidden = false;
          // Avoid showing the same validation error twice — once in the
          // larger shared errorEl and again in each field's inline alert.
          Object.keys(fieldErrorEls).forEach(function (id) {
            fieldErrorEls[id].hidden = true;
          });
        } else {
          errorEl.hidden = true;
          errorEl.textContent = '';
        }
        if (onPriceUpdate) onPriceUpdate(data);
      })
      .catch(function () {
        priceEl.hidden = true;
        breakdownEl.hidden = true;
      });
  }

  // Replaces each field breakdown's fieldId with the field's label, so the
  // snapshot stored on the order line item is self-contained.
  function resolveBreakdownLabels(breakdown, fields) {
    return {
      baseMinor: breakdown.baseMinor,
      fields: breakdown.fields.map(function (fb) {
        var fieldDef = null;
        for (var i = 0; i < fields.length; i++) {
          if (fields[i].id === fb.fieldId) { fieldDef = fields[i]; break; }
        }
        return {
          fieldLabel: fieldDef ? fieldDef.label : fb.fieldId,
          unmatchedCount: fb.unmatchedCount,
          unmatchedPricePerCharMinor: fb.unmatchedPricePerCharMinor,
          unmatchedSubtotalMinor: fb.unmatchedSubtotalMinor,
          groups: fb.groups,
          subtotalMinor: fb.subtotalMinor,
        };
      }),
    };
  }

  function renderBreakdown(breakdown, fields, breakdownEl) {
    breakdownEl.innerHTML = '';
    var items = [];

    if (breakdown.baseMinor > 0) {
      items.push('Base: ' + formatMinor(breakdown.baseMinor));
    }

    for (var i = 0; i < breakdown.fields.length; i++) {
      var fb = breakdown.fields[i];
      if (fb.subtotalMinor === 0) continue;

      var fieldDef = null;
      for (var k = 0; k < fields.length; k++) {
        if (fields[k].id === fb.fieldId) { fieldDef = fields[k]; break; }
      }
      var fieldLabel = fieldDef ? fieldDef.label : 'Field';

      for (var j = 0; j < fb.groups.length; j++) {
        var g = fb.groups[j];
        if (g.charCount > 0) {
          items.push(fieldLabel + ' — ' + g.label + ' (' + g.charCount + '): ' + formatMinor(g.subtotalMinor));
        }
      }
      if (fb.unmatchedCount > 0) {
        items.push(fieldLabel + ' — standard (' + fb.unmatchedCount + '): ' + formatMinor(fb.unmatchedSubtotalMinor));
      }
    }

    // Only show when there are at least two line items — a single line adds no info
    if (items.length <= 1) {
      breakdownEl.hidden = true;
      return;
    }

    items.forEach(function (text) {
      var p = document.createElement('p');
      p.className = 'etch-customization__breakdown-item';
      p.textContent = text;
      breakdownEl.appendChild(p);
    });
    breakdownEl.hidden = false;
  }

  function formatMinor(minor) {
    return '$' + (minor / 100).toFixed(2);
  }

  // Boot all blocks on the page. Guard prevents double-init when a theme places
  // multiple blocks of this type (each block includes its own <script> tag).
  document.querySelectorAll('.etch-customization:not([data-etch-init])').forEach(function(container) {
    container.setAttribute('data-etch-init', '1');
    initBlock(container);
  });
})();

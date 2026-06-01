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

    // Pricing snapshot — underscore prefix hides from customer-facing UI
    // but remains visible in the merchant's admin order view.
    // The Cart Transform function reads these to enforce the correct price.
    var snapMinorInput = makeHiddenInput('properties[_etch_price_minor]', '');
    var snapPriceInput = makeHiddenInput('properties[_etch_price]', '');
    var snapAtInput = makeHiddenInput('properties[_etch_calculated_at]', '');
    container.appendChild(snapMinorInput);
    container.appendChild(snapPriceInput);
    container.appendChild(snapAtInput);

    // null until first successful price response — cart button stays disabled until set
    var latestPriceData = null;

    // Per-field validity. All start true; button disabled because latestPriceData is null.
    var validityMap = {};
    fields.forEach(function (f) { validityMap[f.id] = true; });

    var cartBtn = findCartButton();
    var productForm = cartBtn ? cartBtn.closest('form') : null;

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
      updateBtn();
    }

    // Guard against edge cases where the button somehow submits without a snapshot
    if (productForm) {
      productForm.addEventListener('submit', function (e) {
        if (latestPriceData === null) {
          e.preventDefault();
          errorEl.textContent = 'Pricing is still loading — please wait a moment before adding to cart.';
          errorEl.hidden = false;
        }
      });
    }

    var inputMap = {};

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
      // Shopify line item property — carries the shopper's text through to the order
      input.name = 'properties[' + field.label + ']';
      input.className = 'etch-customization__input';
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

        inputMap[field.id] = input.value;
        schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, breakdownEl, onPriceUpdate);
      });

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      wrapper.appendChild(hint);
      wrapper.appendChild(fieldError);
      fieldsEl.appendChild(wrapper);

      inputMap[field.id] = '';
    });

    // Initial button state: disabled until price loads
    updateBtn();

    fetchPreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, breakdownEl, onPriceUpdate);
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
        errors.push('Characters not allowed: ' + Array.from(bad).join(''));
      }
    }
    if (field.disallowedChars) {
      var disallowedSet = new Set(Array.from(field.disallowedChars));
      var found = new Set();
      chars.forEach(function (c) { if (disallowedSet.has(c)) found.add(c); });
      if (found.size > 0) {
        errors.push('Characters not allowed: ' + Array.from(found).join(''));
      }
    }
    return errors;
  }

  var debounceTimer;
  function schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, breakdownEl, onPriceUpdate) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      fetchPreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, breakdownEl, onPriceUpdate);
    }, 350);
  }

  function fetchPreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, breakdownEl, onPriceUpdate) {
    priceEl.textContent = 'Calculating…';
    priceEl.hidden = false;

    fetch(appUrl + '/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop: shop, productId: productId, fields: inputMap }),
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
        // API-level errors (server-side normalization edge cases) surface in errorEl
        if (!data.valid && data.errors.length > 0) {
          errorEl.textContent = data.errors.join(' ');
          errorEl.hidden = false;
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

  // Boot all blocks on the page
  document.querySelectorAll('.etch-customization').forEach(initBlock);
})();

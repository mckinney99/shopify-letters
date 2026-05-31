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

    var inputMap = {};

    fields.forEach(function (field) {
      var uid = 'etch-' + blockId + '-' + field.id;
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
      // Shopify line item property — carries text through to the order
      input.name = 'properties[' + field.label + ']';
      input.className = 'etch-customization__input';
      if (field.maxChars) input.maxLength = field.maxChars;
      if (field.minChars) input.required = true;

      // Character-count hint
      var hint = document.createElement('span');
      hint.id = uid + '-hint';
      hint.className = 'etch-customization__hint';
      hint.setAttribute('aria-live', 'polite');
      if (field.maxChars) {
        hint.textContent = '0 / ' + field.maxChars + ' characters';
        input.setAttribute('aria-describedby', hint.id);
      }

      input.addEventListener('input', function () {
        var len = Array.from(input.value).length; // codepoint count
        if (field.maxChars) hint.textContent = len + ' / ' + field.maxChars + ' characters';
        inputMap[field.id] = input.value;
        schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, breakdownEl);
      });

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      wrapper.appendChild(hint);
      fieldsEl.appendChild(wrapper);

      inputMap[field.id] = '';
    });

    // Show base price immediately
    fetchPreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, breakdownEl);
  }

  var debounceTimer;
  function schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, breakdownEl) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      fetchPreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, breakdownEl);
    }, 350);
  }

  function fetchPreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, breakdownEl) {
    // Loading state
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
        if (data.breakdown) {
          renderBreakdown(data.breakdown, fields, breakdownEl);
        }
        if (!data.valid && data.errors.length > 0) {
          errorEl.textContent = data.errors.join(' ');
          errorEl.hidden = false;
        } else {
          errorEl.hidden = true;
          errorEl.textContent = '';
        }
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

    // Only show if there are at least two line items — a single price line adds no info
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

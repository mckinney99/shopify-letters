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

    var variantPricesMap = {};
    try {
      JSON.parse(container.dataset.variantPrices || '[]').forEach(function(v) {
        variantPricesMap[String(v.id)] = v.price;
      });
    } catch(e) {}
    var currency = container.dataset.currency || '';

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
        renderFields(container, data.fields, data.conditions || [], shop, productId, appUrl, fieldsEl, priceEl, errorEl, variantPricesMap, currency);
        fieldsEl.hidden = false;
        if (data.previewEnabled) initPreview(container, data.fields);
      })
      .catch(function () {
        loadingEl.hidden = true;
        errorEl.textContent = 'Customization options are temporarily unavailable.';
        errorEl.hidden = false;
      });
  }

  function renderFields(container, fields, conditions, shop, productId, appUrl, fieldsEl, priceEl, errorEl, variantPricesMap, currency) {
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

    function getBaseMinor() {
      var params = new URLSearchParams(window.location.search);
      var variantId = params.get('variant');
      if (variantId && variantPricesMap[variantId] !== undefined) {
        return variantPricesMap[variantId];
      }
      var ids = Object.keys(variantPricesMap);
      return ids.length > 0 ? variantPricesMap[ids[0]] : null;
    }

    // Capture theme price elements so we can update them with the customized total
    var themePriceEls = [];
    ['span.price-item--regular', 'span.price-item--sale.price-item--last'].forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) {
        if (el.textContent.trim()) themePriceEls.push({ el: el, original: el.textContent.trim() });
      });
    });

    function updateThemePrice(totalMinor) {
      var formatted = formatMinor(totalMinor) + (currency ? ' ' + currency : '');
      themePriceEls.forEach(function(item) { item.el.textContent = formatted; });
    }

    function restoreThemePrice() {
      themePriceEls.forEach(function(item) { item.el.textContent = item.original; });
    }

    var lastSurchargeMinor = null;

    function renderPriceEl(surchargeMinor) {
      if (surchargeMinor === null) {
        priceEl.hidden = true;
        restoreThemePrice();
        return;
      }
      lastSurchargeMinor = surchargeMinor;
      var baseMinor = getBaseMinor();
      var suffix = currency ? ' ' + currency : '';
      if (baseMinor !== null) {
        priceEl.textContent = 'Base price: ' + formatMinor(baseMinor) + suffix;
        updateThemePrice(baseMinor + surchargeMinor);
      } else {
        priceEl.textContent = 'Customization add-on: +' + formatMinor(surchargeMinor);
      }
      priceEl.hidden = false;
    }

    function onVariantChange() {
      if (lastSurchargeMinor === null || priceEl.hidden) return;
      renderPriceEl(lastSurchargeMinor);
    }

    if (!window.__etchVariantListening) {
      window.__etchVariantListening = true;
      var _origPushState = history.pushState.bind(history);
      history.pushState = function() {
        _origPushState.apply(this, arguments);
        window.dispatchEvent(new Event('etch:urlchange'));
      };
      window.addEventListener('popstate', function() {
        window.dispatchEvent(new Event('etch:urlchange'));
      });
    }
    window.addEventListener('etch:urlchange', onVariantChange);

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
      // _etch_price_minor must equal the full line total (base + surcharge) so
      // the mismatch check in the order admin can compare it against the charged price.
      var baseMinor = getBaseMinor();
      var totalMinor = baseMinor !== null ? baseMinor + data.price : data.price;
      snapMinorInput.value = String(totalMinor);
      snapPriceInput.value = data.priceFormatted; // surcharge only — shown in admin UI
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

      // Per-field validation error element (shared by every field type)
      var fieldError = document.createElement('span');
      fieldError.id = errorId;
      fieldError.className = 'etch-customization__field-error';
      fieldError.setAttribute('role', 'alert');
      fieldError.hidden = true;
      fieldErrorEls[field.id] = fieldError;

      // ── Choice field: <select> dropdown ──────────────────────────────────
      if (field.type === 'dropdown') {
        renderDropdown(field, uid, errorId, wrapper, label, fieldError, formTarget,
          validityMap, inputMap, updateBtn, function () {
            etchInputsEl.value = JSON.stringify(inputMap);
            schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId, renderPriceEl);
          });
        fieldsEl.appendChild(wrapper);
        inputMap[field.id] = '';
        return; // done with this field (forEach callback)
      }

      // ── Display-only: text block (SL-79) ────────────────────────────────
      if (field.type === 'text-block') {
        renderTextBlock(field, wrapper, label);
        fieldsEl.appendChild(wrapper);
        return;
      }

      // ── Display-only: static image (SL-79) ──────────────────────────────
      if (field.type === 'image-static') {
        renderImageStatic(field, wrapper, label);
        fieldsEl.appendChild(wrapper);
        return;
      }

      // ── Image swatches (SL-77) ───────────────────────────────────────────
      if (field.type === 'image-swatches') {
        renderImageSwatches(field, uid, errorId, wrapper, label, fieldError, formTarget,
          validityMap, inputMap, updateBtn, function () {
            etchInputsEl.value = JSON.stringify(inputMap);
            schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId, renderPriceEl);
          });
        fieldsEl.appendChild(wrapper);
        inputMap[field.id] = '';
        return;
      }

      // ── File upload field (SL-78) ────────────────────────────────────────
      if (field.type === 'upload') {
        renderUpload(field, uid, errorId, wrapper, label, fieldError, formTarget,
          validityMap, inputMap, updateBtn, appUrl, shop, function () {
            etchInputsEl.value = JSON.stringify(inputMap);
            schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId, renderPriceEl);
          });
        fieldsEl.appendChild(wrapper);
        inputMap[field.id] = '';
        return;
      }

      // ── Choice field: color swatches (single-select) ────────────────────
      if (field.type === 'swatches') {
        renderSwatches(field, uid, errorId, wrapper, label, fieldError, formTarget,
          validityMap, inputMap, updateBtn, function () {
            etchInputsEl.value = JSON.stringify(inputMap);
            schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId, renderPriceEl);
          });
        fieldsEl.appendChild(wrapper);
        inputMap[field.id] = '';
        return;
      }

      // ── Choice field: button group (single-select) ───────────────────────
      if (field.type === 'buttons') {
        renderButtons(field, uid, errorId, wrapper, label, fieldError, formTarget,
          validityMap, inputMap, updateBtn, function () {
            etchInputsEl.value = JSON.stringify(inputMap);
            schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId, renderPriceEl);
          });
        fieldsEl.appendChild(wrapper);
        inputMap[field.id] = '';
        return;
      }

      // ── Choice field: single checkbox ────────────────────────────────────
      if (field.type === 'checkbox') {
        renderCheckbox(field, uid, errorId, wrapper, label, fieldError, formTarget,
          validityMap, inputMap, updateBtn, function () {
            etchInputsEl.value = JSON.stringify(inputMap);
            schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId, renderPriceEl);
          });
        fieldsEl.appendChild(wrapper);
        inputMap[field.id] = '';
        return;
      }

      // ── Number field (SL-80) ────────────────────────────────────────────
      if (field.type === 'number') {
        renderNumberOrDate(field, uid, errorId, wrapper, label, fieldError, formTarget,
          validityMap, inputMap, updateBtn, function () {
            etchInputsEl.value = JSON.stringify(inputMap);
            schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId, renderPriceEl);
          }, 'number');
        fieldsEl.appendChild(wrapper);
        inputMap[field.id] = '';
        return;
      }

      // ── Date field (SL-80) ──────────────────────────────────────────────
      if (field.type === 'date') {
        renderNumberOrDate(field, uid, errorId, wrapper, label, fieldError, formTarget,
          validityMap, inputMap, updateBtn, function () {
            etchInputsEl.value = JSON.stringify(inputMap);
            schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId, renderPriceEl);
          }, 'date');
        fieldsEl.appendChild(wrapper);
        inputMap[field.id] = '';
        return;
      }

      // ── Text / paragraph field ───────────────────────────────────────────
      // Input element — a single-line <input> by default, or a multi-line
      // <textarea> for "paragraph text" fields. Both expose .value / .maxLength
      // and fire the same input/keydown events, so all handling below is shared.
      var input;
      if (field.type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = 3;
      } else {
        input = document.createElement('input');
        input.type = 'text';
      }
      input.id = uid;
      input.className = 'etch-customization__input';
      // Hidden mirror inside the product form — submits the value even if the block is outside <form>
      var hiddenFieldInput = makeHiddenInput('properties[' + field.label + ']', '');
      formTarget.appendChild(hiddenFieldInput);
      // Only use maxLength when spaces count toward the limit — otherwise the
      // browser would reject valid inputs where spaces push past the limit.
      if (field.maxChars && field.countSpaces !== false) input.maxLength = field.maxChars;
      var describedBy = errorId;

      // Character-count hint
      var hint = document.createElement('span');
      hint.id = uid + '-hint';
      hint.className = 'etch-customization__hint';
      hint.setAttribute('aria-live', 'polite');
      if (field.maxChars) {
        var hintUnit = field.countSpaces === false ? ' billed characters' : ' characters';
        hint.textContent = '0 / ' + field.maxChars + hintUnit;
        describedBy = hint.id + ' ' + errorId;
      }
      input.setAttribute('aria-describedby', describedBy);

      // Pre-compute sets once so keydown handler is cheap.
      var allowedSet = field.allowedChars ? new Set(Array.from(field.allowedChars)) : null;
      var disallowedSet = field.disallowedChars ? new Set(Array.from(field.disallowedChars)) : null;

      // Block disallowed keystrokes and show an immediate inline error.
      // Paste is handled by the input event — validateField catches anything
      // that slips through.
      input.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key.length !== 1) return;

        var msg = '';
        if (field.allowSpaces === false && e.key === ' ') {
          msg = 'Spaces are not allowed.';
        } else if (disallowedSet && disallowedSet.has(e.key)) {
          msg = 'Character ' + e.key + ' not allowed.';
        } else if (allowedSet && e.key !== ' ' && !allowedSet.has(e.key)) {
          msg = 'Character ' + e.key + ' not allowed.';
        }

        if (msg) {
          e.preventDefault();
          fieldError.textContent = msg;
          fieldError.hidden = false;
          input.setAttribute('aria-invalid', 'true');
        }
      });

      input.addEventListener('input', function () {
        var len = Array.from(input.value).length; // codepoint count
        var billedLen = field.countSpaces === false
          ? Array.from(input.value.replace(/ /g, '')).length
          : len;
        if (field.maxChars) {
          var unit = field.countSpaces === false ? ' billed characters' : ' characters';
          hint.textContent = billedLen + ' / ' + field.maxChars + unit;
        }

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
        // Evaluate conditions AFTER inputMap is updated (Defect 4 fix: was capture-phase listener).
        evaluateConditions();
        schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId, renderPriceEl, getBaseMinor());
      });

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      wrapper.appendChild(hint);
      wrapper.appendChild(fieldError);

      // Font chooser (SL-81)
      if (field.fontOptions) {
        try {
          var fonts = JSON.parse(field.fontOptions);
          if (Array.isArray(fonts) && fonts.length > 0) {
            renderFontPicker(fonts, input, wrapper);
          }
        } catch(e) {}
      }

      // Text color chooser (SL-82)
      if (field.textColorOptions) {
        try {
          var colors = JSON.parse(field.textColorOptions);
          if (Array.isArray(colors) && colors.length > 0) {
            renderColorPicker(colors, input, wrapper);
          }
        } catch(e) {}
      }

      fieldsEl.appendChild(wrapper);

      inputMap[field.id] = '';
    });

    // Bundled JSON attribute read by the Cart Transform function via
    // attribute(key: "_etch_inputs"). Must be created before evaluateConditions
    // so it's defined when that function writes to etchInputsEl.value.
    var etchInputsEl = makeHiddenInput('properties[_etch_inputs]', JSON.stringify(inputMap));
    formTarget.appendChild(etchInputsEl);

    // SL-85: evaluate conditions on each input change; show/hide dependent fields.
    // Called AFTER inputMap is updated in each field's input handler (see below).
    var fieldWrappers = {};
    fieldsEl.querySelectorAll('.etch-customization__field').forEach(function(wrapper, i) {
      fieldWrappers[fields[i].id] = wrapper;
    });

    // AND semantics: all conditions for a field must be met for it to show.
    function evaluateConditions() {
      var condsByField = {};
      conditions.forEach(function(cond) {
        if (!condsByField[cond.fieldId]) condsByField[cond.fieldId] = [];
        condsByField[cond.fieldId].push(cond);
      });
      Object.keys(condsByField).forEach(function(fieldId) {
        var wrapper = fieldWrappers[fieldId];
        if (!wrapper) return;
        var active = condsByField[fieldId].every(function(cond) {
          var triggerValue = (inputMap[cond.triggerFieldId] || '').trim();
          return cond.operator === 'equals' ? triggerValue === cond.value : true;
        });
        wrapper.hidden = !active;
        if (!active) {
          var inp = wrapper.querySelector('input');
          if (inp && inp.value) {
            inp.value = '';
            var fieldDef = fields.find(function(f) { return f.id === fieldId; });
            inputMap[fieldId] = '';
            var hiddenMirror = formTarget.querySelector('input[name="properties[' + (fieldDef ? fieldDef.label : '') + ']"]');
            if (hiddenMirror) hiddenMirror.value = '';
          }
          validityMap[fieldId] = true; // hidden fields never block the cart button
        }
      });
      etchInputsEl.value = JSON.stringify(inputMap);
    }

    // Initial evaluation on load
    evaluateConditions();

    // Static per-character pricing summary — shows rates, not calculated totals
    var pricedFields = fields.filter(function(f) { return f.perCharPrice != null && (f.mode == null || f.mode === 'per_char'); });
    if (pricedFields.length > 0) {
      var pricingInfoEl = document.createElement('div');
      pricingInfoEl.className = 'etch-customization__pricing-info';
      var multiField = pricedFields.length > 1;
      pricedFields.forEach(function(f) {
        var defaultLine = document.createElement('p');
        defaultLine.className = 'etch-customization__breakdown-item';
        defaultLine.textContent = (multiField ? f.label + ' — ' : '') + 'Per-character price: ' + formatDollar(f.perCharPrice);
        pricingInfoEl.appendChild(defaultLine);
        (f.charGroups || []).forEach(function(g) {
          var groupLine = document.createElement('p');
          groupLine.className = 'etch-customization__breakdown-item';
          groupLine.style.paddingLeft = '1em';
          groupLine.textContent = g.label + ': ' + formatDollar(g.pricePerChar);
          pricingInfoEl.appendChild(groupLine);
        });
      });
      fieldsEl.appendChild(pricingInfoEl);
    }

    // Initial button state: disabled until price loads
    updateBtn();

    fetchPreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId, renderPriceEl, getBaseMinor());
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

  // Renders a <select> dropdown for a choice field and wires its change event
  // to per-field validity, the hidden form input, and a price refresh.
  function renderDropdown(field, uid, errorId, wrapper, label, fieldError, formTarget, validityMap, inputMap, updateBtn, onChange) {
    var select = document.createElement('select');
    select.id = uid;
    select.className = 'etch-customization__input etch-customization__select';
    select.setAttribute('aria-describedby', errorId);

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = field.required ? 'Select…' : 'Select… (optional)';
    select.appendChild(placeholder);

    (field.options || []).forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt.label;
      o.textContent = opt.priceDelta ? opt.label + ' (+' + formatDollar(opt.priceDelta) + ')' : opt.label;
      select.appendChild(o);
    });

    var hiddenFieldInput = makeHiddenInput('properties[' + field.label + ']', '');
    formTarget.appendChild(hiddenFieldInput);

    // Required-but-unselected starts invalid so the add-to-cart button stays disabled.
    validityMap[field.id] = !field.required;

    select.addEventListener('change', function () {
      var val = select.value;
      if (field.required && !val) {
        fieldError.textContent = 'Please select an option.';
        fieldError.hidden = false;
        select.setAttribute('aria-invalid', 'true');
        validityMap[field.id] = false;
      } else {
        fieldError.hidden = true;
        fieldError.textContent = '';
        select.removeAttribute('aria-invalid');
        validityMap[field.id] = true;
      }
      updateBtn();
      hiddenFieldInput.value = val;
      inputMap[field.id] = val;
      onChange();
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    wrapper.appendChild(fieldError);
  }

  // Renders a single-select group of buttons for a "buttons" field. Same data
  // as a dropdown; the chosen option's label is stored like any other choice.
  function renderButtons(field, uid, errorId, wrapper, label, fieldError, formTarget, validityMap, inputMap, updateBtn, onChange) {
    label.id = uid + '-label';
    label.removeAttribute('for');

    var group = document.createElement('div');
    group.className = 'etch-customization__buttons';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', label.id);
    group.setAttribute('aria-describedby', errorId);

    var hiddenFieldInput = makeHiddenInput('properties[' + field.label + ']', '');
    formTarget.appendChild(hiddenFieldInput);

    // Required-but-unselected starts invalid so the add-to-cart button stays disabled.
    validityMap[field.id] = !field.required;

    function choose(val, btn) {
      Array.prototype.forEach.call(group.children, function (b) {
        var on = b === btn;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.classList.toggle('is-selected', on);
      });
      fieldError.hidden = true;
      fieldError.textContent = '';
      validityMap[field.id] = true;
      updateBtn();
      hiddenFieldInput.value = val;
      inputMap[field.id] = val;
      onChange();
    }

    (field.options || []).forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button'; // never submit the product form
      btn.className = 'etch-customization__button';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      btn.textContent = opt.priceDelta ? opt.label + ' (+' + formatDollar(opt.priceDelta) + ')' : opt.label;
      btn.addEventListener('click', function () { choose(opt.label, btn); });
      group.appendChild(btn);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(group);
    wrapper.appendChild(fieldError);
  }

  // Renders colored circle swatches for a "swatches" field. Same pricing path
  // as buttons — stores the option label as the selected value.
  function renderSwatches(field, uid, errorId, wrapper, label, fieldError, formTarget, validityMap, inputMap, updateBtn, onChange) {
    label.id = uid + '-label';
    label.removeAttribute('for');

    var group = document.createElement('div');
    group.className = 'etch-customization__swatches';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', label.id);
    group.setAttribute('aria-describedby', errorId);

    var hiddenFieldInput = makeHiddenInput('properties[' + field.label + ']', '');
    formTarget.appendChild(hiddenFieldInput);

    validityMap[field.id] = !field.required;

    function choose(val, btn) {
      Array.prototype.forEach.call(group.children, function (b) {
        var on = b === btn;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.classList.toggle('is-selected', on);
      });
      fieldError.hidden = true;
      fieldError.textContent = '';
      validityMap[field.id] = true;
      updateBtn();
      hiddenFieldInput.value = val;
      inputMap[field.id] = val;
      onChange();
    }

    (field.options || []).forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'etch-customization__swatch';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      var tooltip = opt.label + (opt.priceDelta ? ' (+' + formatDollar(opt.priceDelta) + ')' : '');
      btn.setAttribute('aria-label', tooltip);
      btn.title = tooltip;
      if (opt.swatchColor) btn.style.backgroundColor = opt.swatchColor;
      btn.addEventListener('click', function () { choose(opt.label, btn); });
      group.appendChild(btn);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(group);
    wrapper.appendChild(fieldError);
  }

  // Renders a single checkbox for a checkbox field. Stores the option label
  // ("Yes") when ticked, empty when not, so it prices/validates like any option.
  function renderCheckbox(field, uid, errorId, wrapper, label, fieldError, formTarget, validityMap, inputMap, updateBtn, onChange) {
    var opt = (field.options && field.options[0]) || { label: 'Yes', priceDelta: 0 };
    var optionLabel = opt.label || 'Yes';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = uid;
    cb.className = 'etch-customization__checkbox';
    cb.setAttribute('aria-describedby', errorId);

    label.htmlFor = uid;
    if (opt.priceDelta) label.textContent = field.label + ' (+' + formatDollar(opt.priceDelta) + ')';

    var hiddenFieldInput = makeHiddenInput('properties[' + field.label + ']', '');
    formTarget.appendChild(hiddenFieldInput);

    // A required checkbox starts unticked → invalid until the shopper ticks it.
    validityMap[field.id] = !field.required;

    cb.addEventListener('change', function () {
      if (field.required && !cb.checked) {
        fieldError.textContent = 'Please tick this box to continue.';
        fieldError.hidden = false;
        cb.setAttribute('aria-invalid', 'true');
        validityMap[field.id] = false;
      } else {
        fieldError.hidden = true;
        fieldError.textContent = '';
        cb.removeAttribute('aria-invalid');
        validityMap[field.id] = true;
      }
      updateBtn();
      var val = cb.checked ? optionLabel : '';
      hiddenFieldInput.value = val;
      inputMap[field.id] = val;
      onChange();
    });

    var row = document.createElement('div');
    row.className = 'etch-customization__checkbox-row';
    row.appendChild(cb);
    row.appendChild(label);
    wrapper.appendChild(row);
    wrapper.appendChild(fieldError);
  }

  // ── Image swatches (SL-77) ────────────────────────────────────────────────
  function renderImageSwatches(field, uid, errorId, wrapper, label, fieldError, formTarget, validityMap, inputMap, updateBtn, onChange) {
    label.id = uid + '-label';
    label.removeAttribute('for');

    var group = document.createElement('div');
    group.className = 'etch-customization__image-swatches';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', label.id);
    group.setAttribute('aria-describedby', errorId);

    var hiddenFieldInput = makeHiddenInput('properties[' + field.label + ']', '');
    formTarget.appendChild(hiddenFieldInput);

    validityMap[field.id] = !field.required;

    function choose(val, btn) {
      Array.prototype.forEach.call(group.children, function (b) {
        var on = b === btn;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.classList.toggle('is-selected', on);
      });
      fieldError.hidden = true;
      fieldError.textContent = '';
      validityMap[field.id] = true;
      updateBtn();
      hiddenFieldInput.value = val;
      inputMap[field.id] = val;
      onChange();
    }

    (field.options || []).forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'etch-customization__image-swatch';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      var tooltip = opt.label + (opt.priceDelta ? ' (+' + formatDollar(opt.priceDelta) + ')' : '');
      btn.setAttribute('aria-label', tooltip);
      btn.title = tooltip;
      if (opt.imageUrl) {
        var img = document.createElement('img');
        img.src = opt.imageUrl;
        img.alt = opt.label;
        img.className = 'etch-customization__image-swatch-img';
        btn.appendChild(img);
      }
      var cap = document.createElement('span');
      cap.className = 'etch-customization__image-swatch-label';
      cap.textContent = opt.label;
      btn.appendChild(cap);
      btn.addEventListener('click', function () { choose(opt.label, btn); });
      group.appendChild(btn);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(group);
    wrapper.appendChild(fieldError);
  }

  // ── File upload (SL-78) ───────────────────────────────────────────────────
  function renderUpload(field, uid, errorId, wrapper, label, fieldError, formTarget, validityMap, inputMap, updateBtn, appUrl, shop, onChange) {
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = uid;
    fileInput.className = 'etch-customization__upload';
    fileInput.setAttribute('aria-describedby', errorId);
    if (field.fileAccept && field.fileAccept !== '*/*') fileInput.accept = field.fileAccept;

    var hiddenFieldInput = makeHiddenInput('properties[' + field.label + ']', '');
    formTarget.appendChild(hiddenFieldInput);

    // Required-but-empty starts invalid.
    validityMap[field.id] = !field.required;

    var statusEl = document.createElement('span');
    statusEl.className = 'etch-customization__upload-status';
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.hidden = true;

    var previewImg = document.createElement('img');
    previewImg.className = 'etch-customization__upload-preview';
    previewImg.hidden = true;
    previewImg.alt = '';

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;

      // Show a local preview for images immediately.
      if (file.type.indexOf('image/') === 0) {
        var reader = new FileReader();
        reader.onload = function (ev) {
          previewImg.src = ev.target.result;
          previewImg.hidden = false;
        };
        reader.readAsDataURL(file);
      } else {
        previewImg.hidden = true;
      }

      statusEl.textContent = 'Uploading…';
      statusEl.hidden = false;
      validityMap[field.id] = false;
      updateBtn();

      var data = new FormData();
      data.append('shop', shop);
      data.append('file', file);

      fetch(appUrl + '/api/upload', { method: 'POST', body: data })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
        .then(function (json) {
          if (!json.url) throw new Error('no url');
          statusEl.textContent = 'Uploaded.';
          hiddenFieldInput.value = json.url;
          inputMap[field.id] = json.url;
          validityMap[field.id] = true;
          updateBtn();
          onChange();
        })
        .catch(function () {
          statusEl.textContent = 'Upload failed — please try again.';
          fieldError.textContent = 'Upload failed.';
          fieldError.hidden = false;
          validityMap[field.id] = false;
          updateBtn();
        });
    });

    wrapper.appendChild(label);
    wrapper.appendChild(fileInput);
    wrapper.appendChild(statusEl);
    wrapper.appendChild(previewImg);
    wrapper.appendChild(fieldError);
  }

  // ── Display-only: text block (SL-79) ─────────────────────────────────────
  function renderTextBlock(field, wrapper, label) {
    var p = document.createElement('p');
    p.className = 'etch-customization__text-block';
    p.textContent = field.helpText || '';
    wrapper.appendChild(p);
  }

  // ── Display-only: static image (SL-79) ───────────────────────────────────
  function renderImageStatic(field, wrapper, label) {
    if (!field.helpText) return;
    var img = document.createElement('img');
    img.src = field.helpText;
    img.className = 'etch-customization__image-static';
    img.alt = field.label || '';
    wrapper.appendChild(label);
    wrapper.appendChild(img);
  }

  // ── Number / date field (SL-80) ───────────────────────────────────────────
  function renderNumberOrDate(field, uid, errorId, wrapper, label, fieldError, formTarget, validityMap, inputMap, updateBtn, onChange, inputType) {
    var input = document.createElement('input');
    input.type = inputType;
    input.id = uid;
    input.className = 'etch-customization__input';
    input.setAttribute('aria-describedby', errorId);

    if (inputType === 'number') {
      if (field.minChars != null) input.min = String(field.minChars);
      if (field.maxChars != null) input.max = String(field.maxChars);
    }
    if (inputType === 'date' && field.dateFutureOnly) {
      var today = new Date();
      input.min = today.toISOString().slice(0, 10);
    }

    var hiddenFieldInput = makeHiddenInput('properties[' + field.label + ']', '');
    formTarget.appendChild(hiddenFieldInput);

    validityMap[field.id] = !field.required;

    input.addEventListener('change', function () {
      var val = input.value;
      var err = '';
      if (!val) {
        if (field.required) err = 'This field is required.';
      } else if (inputType === 'number') {
        var n = Number(val);
        if (isNaN(n)) { err = 'Must be a number.'; }
        else if (field.minChars != null && n < field.minChars) { err = 'Must be at least ' + field.minChars + '.'; }
        else if (field.maxChars != null && n > field.maxChars) { err = 'Must be at most ' + field.maxChars + '.'; }
      } else if (inputType === 'date' && field.dateFutureOnly) {
        var d = new Date(val);
        if (d < new Date()) err = 'Must be a future date.';
      }

      if (err) {
        fieldError.textContent = err;
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
      hiddenFieldInput.value = val;
      inputMap[field.id] = val;
      onChange();
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    wrapper.appendChild(fieldError);
  }

  // ── Font picker (SL-81) ───────────────────────────────────────────────────
  function renderFontPicker(fonts, textInput, wrapper) {
    // Load Google Fonts for non-web-safe fonts, then show pill selector.
    var webSafe = new Set(['Georgia', 'Times New Roman', 'Arial', 'Courier New']);
    var googleFonts = fonts.filter(function(f) { return !webSafe.has(f); });
    if (googleFonts.length > 0) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=' +
        googleFonts.map(function(f) { return f.replace(/ /g, '+'); }).join('&family=') + '&display=swap';
      document.head.appendChild(link);
    }

    var row = document.createElement('div');
    row.className = 'etch-customization__font-picker';

    fonts.forEach(function(f) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'etch-customization__font-pill';
      btn.textContent = f;
      btn.style.fontFamily = f + ', serif';
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(row.children, function(b) { b.classList.remove('is-selected'); });
        btn.classList.add('is-selected');
        textInput.style.fontFamily = f + ', serif';
      });
      row.appendChild(btn);
    });

    wrapper.appendChild(row);
  }

  // ── Text color picker (SL-82) ─────────────────────────────────────────────
  function renderColorPicker(colors, textInput, wrapper) {
    var row = document.createElement('div');
    row.className = 'etch-customization__color-picker';

    colors.forEach(function(c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'etch-customization__color-swatch';
      btn.style.backgroundColor = c.color;
      btn.title = c.label;
      btn.setAttribute('aria-label', c.label);
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(row.children, function(b) { b.classList.remove('is-selected'); });
        btn.classList.add('is-selected');
        textInput.style.color = c.color;
      });
      row.appendChild(btn);
    });

    wrapper.appendChild(row);
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
    if (field.allowSpaces === false && normalized.indexOf(' ') !== -1) {
      errors.push('Spaces are not allowed.');
    }
    if (field.allowedChars) {
      var allowed = new Set(Array.from(field.allowedChars));
      var bad = new Set();
      chars.forEach(function (c) { if (c !== ' ' && !allowed.has(c)) bad.add(c); });
      if (bad.size > 0) {
        var badArr = Array.from(bad);
        errors.push('Character' + (badArr.length === 1 ? '' : 's') + ' ' + badArr.join(', ') + ' not allowed.');
      }
    }
    if (field.disallowedChars) {
      var disallowedSetV = new Set(Array.from(field.disallowedChars));
      var found = new Set();
      chars.forEach(function (c) { if (disallowedSetV.has(c)) found.add(c); });
      if (found.size > 0) {
        var foundArr = Array.from(found);
        errors.push('Character' + (foundArr.length === 1 ? '' : 's') + ' ' + foundArr.join(', ') + ' not allowed.');
      }
    }
    return errors;
  }

  var debounceTimer;
  function schedulePreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId, renderPrice, baseMinor) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      fetchPreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId, renderPrice, baseMinor);
    }, 350);
  }

  function fetchPreview(shop, productId, appUrl, inputMap, fields, priceEl, errorEl, fieldErrorEls, breakdownEl, onPriceUpdate, correlationId, renderPrice, baseMinor) {
    fetch(appUrl + '/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop: shop, productId: productId, fields: inputMap, correlationId: correlationId, baseMinor: baseMinor != null ? baseMinor : null }),
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) {
          renderPrice(null);
          breakdownEl.hidden = true;
          return;
        }
        renderPrice(data.price);
        if (data.breakdown) renderBreakdown(data.breakdown, fields, breakdownEl);
        // Route server-side validation errors to the inline element for the
        // matching field (stripping the "Label: " prefix the server adds).
        // Errors that don't match any field fall back to the global errorEl.
        if (!data.valid && data.errors.length > 0) {
          var unrouted = [];
          data.errors.forEach(function (e) {
            var matched = false;
            for (var fi = 0; fi < fields.length; fi++) {
              var pfx = fields[fi].label + ': ';
              if (e.indexOf(pfx) === 0) {
                var el = fieldErrorEls[fields[fi].id];
                el.textContent = e.slice(pfx.length);
                el.hidden = false;
                matched = true;
                break;
              }
            }
            if (!matched) unrouted.push(e);
          });
          if (unrouted.length > 0) {
            errorEl.textContent = unrouted.join(' ');
            errorEl.hidden = false;
          } else {
            errorEl.hidden = true;
            errorEl.textContent = '';
          }
        } else {
          errorEl.hidden = true;
          errorEl.textContent = '';
        }
        if (onPriceUpdate) onPriceUpdate(data);
      })
      .catch(function () {
        renderPrice(null);
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

  function formatDollar(amount) {
    return '$' + Number(amount).toFixed(2);
  }

  // Overlays the shopper's typed text on the product image in real time.
  // Decoupled from pricing/cart plumbing — display only, no hidden inputs touched.
  function initPreview(container, fields) {
    var TEXT_TYPES = ['text', 'textarea'];
    var textFields = fields.filter(function(f) { return TEXT_TYPES.indexOf(f.type) !== -1; });
    if (textFields.length === 0) return;

    // Find the product's featured image; try common selectors across popular themes.
    var SELECTORS = [
      '.product__media--featured img',
      '.product__media img',
      '.product-single__photo img',
      '.product-featured-media img',
      '[data-product-featured-image]',
      '.product-image img',
    ];
    var productImg = null;
    for (var si = 0; si < SELECTORS.length; si++) {
      productImg = document.querySelector(SELECTORS[si]);
      if (productImg) break;
    }
    if (!productImg) return;

    var imgContainer = productImg.parentElement;
    if (window.getComputedStyle(imgContainer).position === 'static') {
      imgContainer.style.position = 'relative';
    }

    // Root overlay covers the whole image; individual spans are positioned within it.
    var overlay = document.createElement('div');
    overlay.className = 'etch-preview-overlay';
    overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;box-sizing:border-box';
    imgContainer.appendChild(overlay);

    var blockId = container.id;
    // Track per-field span elements so we can update them efficiently.
    var fieldSpans = {};

    function getOrCreateSpan(field) {
      if (fieldSpans[field.id]) return fieldSpans[field.id];
      var span = document.createElement('span');
      var hasPlacement = field.previewX != null && field.previewY != null;
      if (hasPlacement) {
        span.style.cssText = 'position:absolute;'
          + 'left:' + field.previewX + '%;'
          + 'top:' + field.previewY + '%;'
          + 'width:' + (field.previewW != null ? field.previewW : 80) + '%;'
          + 'min-height:' + (field.previewH != null ? field.previewH : 15) + '%;'
          + 'color:#fff;font-weight:bold;text-align:center;'
          + 'font-size:clamp(12px,3vw,24px);'
          + 'text-shadow:0 1px 6px rgba(0,0,0,0.85);'
          + 'word-break:break-word;line-height:1.3;'
          + 'display:flex;align-items:center;justify-content:center;box-sizing:border-box';
      } else {
        // Auto-center: stacked as flex items in the overlay
        span.style.cssText = 'display:block;color:#fff;font-size:clamp(14px,4vw,28px);font-weight:bold;'
          + 'text-align:center;text-shadow:0 1px 6px rgba(0,0,0,0.85);word-break:break-word;max-width:100%;line-height:1.3';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.gap = '4px';
        overlay.style.padding = '12px';
      }
      overlay.appendChild(span);
      fieldSpans[field.id] = span;
      return span;
    }

    function updateOverlay() {
      textFields.forEach(function(field) {
        var el = document.getElementById('etch-' + blockId + '-' + field.id);
        var text = el ? el.value.trim() : '';
        var span = getOrCreateSpan(field);
        span.textContent = text;
        span.style.display = text ? (field.previewX != null ? 'flex' : 'block') : 'none';
      });
    }

    // Initialise (all empty) so spans are pre-created in DOM order.
    updateOverlay();

    container.addEventListener('input', function(e) {
      if (e.target.classList && e.target.classList.contains('etch-customization__input')) {
        updateOverlay();
      }
    });
  }

  // Boot all blocks on the page. Guard prevents double-init when a theme places
  // multiple blocks of this type (each block includes its own <script> tag).
  document.querySelectorAll('.etch-customization:not([data-etch-init])').forEach(function(container) {
    container.setAttribute('data-etch-init', '1');
    if (container.dataset.embed === 'true') {
      // App-embed mode: div is rendered at </body>. Move it after the product form
      // so it sits naturally in the page flow. Tries several common selectors in
      // order of specificity; falls back to showing in-place if nothing matches.
      var anchor =
        document.querySelector('product-form') ||
        document.querySelector('form[action*="/cart/add"]') ||
        document.querySelector('.product-form');
      if (anchor) {
        anchor.insertAdjacentElement('afterend', container);
      }
      container.removeAttribute('hidden');
    }
    initBlock(container);
  });
})();

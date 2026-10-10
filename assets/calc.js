/* Paisa Gyaan calculators. Everything runs in the browser; nothing is sent anywhere. */
(function (root) {
  "use strict";

  // --- Pure calculations (also loaded by Node for testing) -------------------

  // Paying only the minimum due each month, with no new spending.
  // Each month: the minimum is a share of the statement balance; interest on that
  // balance and GST on the interest are then added.
  function minimumDuePath(balance, monthlyRatePct, minPct, gstPct, months) {
    var rate = monthlyRatePct / 100, min = minPct / 100, gst = gstPct / 100;
    var bal = balance, paid = 0, clearedIn = null, checkpoints = {};
    for (var m = 1; m <= months; m++) {
      if (bal > 0.5) {
        var due = bal + bal * rate * (1 + gst);
        var pay = Math.min(due, Math.max(min * bal, 200));
        bal = due - pay;
        paid += pay;
        if (bal <= 0.5 && clearedIn === null) { clearedIn = m; bal = 0; }
      }
      checkpoints[m] = { balance: bal, paid: paid };
    }
    return { checkpoints: checkpoints, clearedIn: clearedIn };
  }

  // Paying a fixed amount each month. Returns null months if the debt never clears.
  function fixedPaymentPath(balance, monthlyRatePct, gstPct, payment) {
    var rate = monthlyRatePct / 100, gst = gstPct / 100;
    var bal = balance, paid = 0, months = 0;
    var firstCharge = balance * rate * (1 + gst);
    if (payment <= firstCharge) return { months: null, paid: null, firstCharge: firstCharge };
    while (bal > 0.5 && months < 1200) {
      var due = bal + bal * rate * (1 + gst);
      var pay = Math.min(due, payment);
      bal = due - pay;
      paid += pay;
      months++;
    }
    return { months: months, paid: paid, firstCharge: firstCharge };
  }

  // First month on the minimum due: where the payment goes.
  function firstMonth(balance, monthlyRatePct, minPct, gstPct) {
    var interest = balance * monthlyRatePct / 100;
    var gst = interest * gstPct / 100;
    var payment = balance * minPct / 100;
    return { interest: interest, gst: gst, payment: payment, reduced: payment - interest - gst };
  }

  // Value of a fixed monthly amount invested at the start of each month, compounded monthly.
  function monthlyInvestmentValue(monthly, annualRatePct, years) {
    var n = Math.round(years * 12), r = annualRatePct / 100 / 12;
    if (n <= 0) return 0;
    if (r === 0) return monthly * n;
    return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
  }

  var PG = {
    minimumDuePath: minimumDuePath,
    fixedPaymentPath: fixedPaymentPath,
    firstMonth: firstMonth,
    monthlyInvestmentValue: monthlyInvestmentValue
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = PG; return; }
  root.PG = PG;

  // --- Page wiring -----------------------------------------------------------

  function rupees(x) { return "₹" + Math.round(x).toLocaleString("en-IN"); }

  function rupeesShort(x) {
    if (x >= 1e7) return "₹" + (x / 1e7).toFixed(2) + " करोड़";
    if (x >= 1e5) return "₹" + (x / 1e5).toFixed(1) + " लाख";
    return rupees(x);
  }

  function num(id) {
    var v = parseFloat(document.getElementById(id).value);
    return isFinite(v) && v >= 0 ? v : 0;
  }

  function set(id, text) { document.getElementById(id).textContent = text; }
  function width(id, share) { document.getElementById(id).style.width = Math.max(0, Math.min(100, share * 100)) + "%"; }

  function durationText(months) {
    var y = Math.floor(months / 12), m = months % 12;
    if (y === 0) return m + " महीने";
    return y + " साल" + (m ? " " + m + " महीने" : "");
  }

  function creditCard() {
    var balance = num("cc-balance"), rate = num("cc-rate"), min = num("cc-min"), gst = num("cc-gst"), pay = num("cc-pay");

    var first = firstMonth(balance, rate, min, gst);
    set("cc-first-pay", rupees(first.payment));
    set("cc-first-interest", rupees(first.interest));
    set("cc-first-gst", rupees(first.gst));
    set("cc-first-reduced", rupees(Math.max(0, first.reduced)));

    var path = minimumDuePath(balance, rate, min, gst, 60);
    set("cc-min-1y", rupees(path.checkpoints[12].balance));
    set("cc-min-5y", rupees(path.checkpoints[60].balance));
    set("cc-min-paid", rupees(path.checkpoints[60].paid));

    var fixed = fixedPaymentPath(balance, rate, gst, pay);
    var never = document.getElementById("cc-never"), ok = document.getElementById("cc-fixed-ok");
    if (fixed.months === null) {
      never.hidden = false; ok.hidden = true;
      set("cc-never-charge", rupees(fixed.firstCharge));
    } else {
      never.hidden = true; ok.hidden = false;
      set("cc-fixed-months", durationText(fixed.months));
      set("cc-fixed-paid", rupees(fixed.paid));
      set("cc-fixed-extra", rupees(fixed.paid - balance));
    }
    set("cc-pay-echo", rupees(pay));

    var scale = Math.max(balance, 1);
    width("cc-bar-start", 1);
    width("cc-bar-5y", path.checkpoints[60].balance / scale);
    set("cc-bar-start-val", rupees(balance));
    set("cc-bar-5y-val", rupees(path.checkpoints[60].balance));
  }

  function delay() {
    var monthly = num("d-monthly"), rate = num("d-rate"), years = num("d-years"), wait = Math.min(num("d-wait"), years);
    var now = monthlyInvestmentValue(monthly, rate, years);
    var later = monthlyInvestmentValue(monthly, rate, years - wait);
    var investedNow = monthly * 12 * years, investedLater = monthly * 12 * (years - wait);
    var savedByWaiting = investedNow - investedLater, lost = now - later;

    set("d-now-invested", rupeesShort(investedNow));
    set("d-now-value", rupeesShort(now));
    set("d-later-invested", rupeesShort(investedLater));
    set("d-later-value", rupeesShort(later));
    set("d-gap-invested", rupeesShort(savedByWaiting));
    set("d-gap-value", rupeesShort(lost));
    set("d-ratio", savedByWaiting > 0 ? (lost / savedByWaiting).toFixed(1) + " गुना" : "—");
    set("d-wait-echo", String(wait));
    set("d-rate-echo", String(rate));

    var scale = Math.max(now, 1);
    width("d-bar-now", now / scale);
    width("d-bar-later", later / scale);
    set("d-bar-now-val", rupeesShort(now));
    set("d-bar-later-val", rupeesShort(later));
  }

  var pages = { "credit-card": creditCard, "delay": delay };

  document.addEventListener("DOMContentLoaded", function () {
    var run = pages[document.body.getAttribute("data-calc")];
    if (!run) return;
    var inputs = document.querySelectorAll(".field input");
    for (var i = 0; i < inputs.length; i++) inputs[i].addEventListener("input", run);
    run();
  });
})(typeof window !== "undefined" ? window : this);

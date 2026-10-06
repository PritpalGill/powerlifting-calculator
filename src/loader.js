/*
 * Powerlifting score calculator embed loader.
 *
 * Replaces each <div class="brolic-powerlifting-calculator"></div> on the page
 * with an iframe of the hosted calculator, then sizes the frame to its content.
 * Optional attributes: data-unit="lb", data-theme="dark" or "auto",
 * data-score="ipfgl" or "wilks" (the score the "total to pass" section uses).
 *
 * The frame is served from the same origin as this script. It sets no cookies
 * and loads no analytics; every calculation runs in the visitor's browser.
 */
(function () {
  "use strict";
  var MESSAGE = "brolic-powerlifting-calculator:height";
  var script = document.currentScript;
  var origin = script && script.src ? new URL(script.src).origin : "https://brolic.app";
  var frames = [];

  function mount(node) {
    if (node.getAttribute("data-mounted")) return;
    node.setAttribute("data-mounted", "true");
    var params = [];
    if (node.getAttribute("data-unit") === "lb") params.push("unit=lb");
    var theme = node.getAttribute("data-theme");
    if (theme === "dark" || theme === "auto") params.push("theme=" + theme);
    var score = node.getAttribute("data-score");
    if (score === "ipfgl" || score === "wilks") params.push("score=" + score);
    var frame = document.createElement("iframe");
    frame.src = origin + "/embed/powerlifting-calculator/" + (params.length ? "?" + params.join("&") : "");
    frame.title = "Powerlifting score calculator: IPF GL, DOTS and Wilks";
    frame.loading = "lazy";
    frame.style.cssText = "display:block;width:100%;max-width:680px;height:780px;border:0;";
    node.appendChild(frame);
    frames.push(frame);
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (event.origin !== origin || !data || data.type !== MESSAGE) return;
    var height = Number(data.height);
    if (!isFinite(height) || height < 200 || height > 3000) return;
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === event.source) frames[i].style.height = Math.ceil(height) + "px";
    }
  });

  function mountAll() {
    var nodes = document.querySelectorAll(".brolic-powerlifting-calculator");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
  else mountAll();
})();

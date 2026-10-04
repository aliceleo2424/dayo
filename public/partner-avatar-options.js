(function (root) {
  'use strict';
  // Add only owner-supplied DayO assets here: {id:'...',label:'...',path:'/images/partner-avatars/...'}.
  var options = Object.freeze([
    {id:'dayo-avatar-01',path:'/images/partner-avatars/dayo-avatar-01.png',label:'DayO avatar 1'},
    {id:'dayo-avatar-02',path:'/images/partner-avatars/dayo-avatar-02.png',label:'DayO avatar 2'},
    {id:'dayo-avatar-03',path:'/images/partner-avatars/dayo-avatar-03.png',label:'DayO avatar 3'},
    {id:'dayo-avatar-04',path:'/images/partner-avatars/dayo-avatar-04.png',label:'DayO avatar 4'}
  ]);
  function isRobotDefault(value) {
    try { var url = new URL(value); return url.hostname === 'api.dicebear.com' && /^\/\d+\.x\/bottts\/svg$/.test(url.pathname); } catch (_) { return false; }
  }
  function imageUrl(value) {
    value = String(value || '').trim();
    if (!value || isRobotDefault(value)) return '';
    if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value;
    if (options.some(function (o) { return o.path === value; })) return value;
    // Preserve existing same-site profile images even if they are not catalog options.
    if (/^\/(?!\/)[^\\]*$/.test(value)) return value;
    try { var url = new URL(value); return ['https:','http:'].includes(url.protocol) ? value : ''; } catch (_) { return ''; }
  }
  function paint(element, value, nickname) {
    var url = imageUrl(value);
    element.classList.toggle('has-photo',!!url); element.style.backgroundImage = url ? 'url('+JSON.stringify(url)+')' : '';
    var label = element.querySelector('span');
    if (label) label.textContent = String(nickname || 'DayO').trim().charAt(0).toUpperCase() || 'D';
  }
  function validUpload(file) { return !!(file && ['image/jpeg','image/png','image/webp'].includes(file.type) && file.size > 0 && file.size <= 2 * 1024 * 1024); }
  var api = {options:options,isRobotDefault:isRobotDefault,imageUrl:imageUrl,paint:paint,validUpload:validUpload};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DayOPartnerAvatars = api;
})(typeof window !== 'undefined' ? window : this);

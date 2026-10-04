(function (root) {
  'use strict';
  var languages = Object.freeze(['English','Korean','French','Spanish','Chinese (Mandarin)','Japanese','German','Portuguese','Other']);
  var levels = [['basic','Basic — Greetings and simple phrases'],['conversational','Conversational — Can hold everyday conversations'],['fluent','Fluent — Comfortable discussing most topics'],['native','Native / near-native']];
  var cities = ['Seoul','Busan','Incheon','Daegu','Daejeon','Gwangju','Ulsan','Sejong','Suwon','Seongnam','Goyang','Yongin'];
  // ISO 3166-1 region codes. Names come from the browser's English Intl region data;
  // application and completion share this source rather than duplicating country names.
  var regions = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
  function countries() {
    var names = new Intl.DisplayNames(['en'], {type:'region'});
    return regions.filter(function (code) { return code !== 'KR'; }).map(function (code) { return {code:code,name:names.of(code)}; }).sort(function (a,b) { return a.name.localeCompare(b.name,'en'); });
  }
  function option(select, value, text) { var el = document.createElement('option'); el.value = value; el.textContent = text; select.append(el); }
  function locationMarkup(fieldClass) {
    var c = fieldClass || '';
    return '<label class="'+c+'">Location<select name="location_status" required><option value="">Choose your location</option><option value="korea">Currently living in Korea</option><option value="overseas">Currently living outside Korea</option></select></label>'+
      '<label class="'+c+'" data-country>Country<select name="country" required><option value="">Choose your country</option></select></label>'+
      '<label class="'+c+'" data-korea-city hidden>Current city<select name="korea_city" disabled><option value="">Choose your city</option></select></label>'+
      '<label class="'+c+'" data-korea-other hidden>What city?<input name="korea_city_other" maxlength="100" disabled></label>'+
      '<label class="'+c+'" data-overseas-city hidden>Current city<input name="city" autocomplete="address-level2" maxlength="100" disabled></label>'+
      '<label class="'+c+'" data-visa hidden>Visa type<select name="visa_type" disabled><option value="">Choose your visa type</option><option>D-2</option><option>D-4</option><option>F-series</option><option value="Other visa">Other visa</option><option value="not_applicable_overseas" hidden>Not applicable — currently living outside Korea</option></select></label>';
  }
  function mountLocation(container, saved) {
    saved = saved || {};
    var find = function (name) { return container.querySelector('[name="'+name+'"]'); };
    var location = find('location_status'), country = find('country'), koreaCity = find('korea_city'), other = find('korea_city_other'), city = find('city'), visa = find('visa_type');
    option(country,'South Korea','South Korea'); countries().forEach(function (c) { option(country,c.name,c.name); });
    cities.forEach(function (c) { option(koreaCity,c,c); }); option(koreaCity,'other','Other city in Korea');
    var savedCountry = saved.country || saved.current_country || '', savedCity = saved.city || saved.current_city || '';
    // Preserve legacy names when editing, even if Intl's spelling differs.
    if (savedCountry && !Array.from(country.options).some(function (o) { return o.value === savedCountry; })) option(country,savedCountry,savedCountry);
    country.value = savedCountry; city.value = savedCity;
    koreaCity.value = cities.includes(savedCity) ? savedCity : savedCity ? 'other' : '';
    other.value = saved.korea_city_other || (koreaCity.value === 'other' ? savedCity : '');
    location.value = saved.location_status || (savedCountry ? (/^(korea|south korea|republic of korea|한국|대한민국)$/i.test(savedCountry) ? 'korea' : 'overseas') : '');
    visa.value = saved.visa_type === 'Other' ? 'Other visa' : saved.visa_type === 'outside_korea' ? 'not_applicable_overseas' : saved.visa_type || '';
    var previousCountry = country.value === 'South Korea' ? '' : country.value, previousVisa = visa.value === 'not_applicable_overseas' ? '' : visa.value;
    function visible(selector, input, on) { container.querySelector(selector).hidden = !on; input.disabled = !on; input.required = on; }
    function update() {
      var korea = location.value === 'korea', overseas = location.value === 'overseas';
      visible('[data-korea-city]',koreaCity,korea); visible('[data-overseas-city]',city,overseas);
      visible('[data-korea-other]',other,korea && koreaCity.value === 'other'); visible('[data-visa]',visa,korea);
      country.disabled = !overseas; country.required = overseas;
      // South Korea is automatic and cannot be selected for overseas applicants.
      country.querySelector('[value="South Korea"]').disabled = overseas;
      if (korea) { if (country.value !== 'South Korea') previousCountry = country.value; country.value = 'South Korea'; if (visa.value === 'not_applicable_overseas') visa.value = previousVisa; }
      if (overseas) { if (country.value === 'South Korea') country.value = previousCountry; if (visa.value !== 'not_applicable_overseas') previousVisa = visa.value; visa.value = 'not_applicable_overseas'; }
    }
    location.addEventListener('change',update); koreaCity.addEventListener('change',update); update();
    return {read:function () { return {location_status:location.value,country:country.value.trim(),city:(location.value === 'korea' ? koreaCity.value === 'other' ? other.value : koreaCity.value : city.value).trim(),korea_city_other:location.value === 'korea' && koreaCity.value === 'other' ? other.value.trim() : null,visa_type:visa.value}; }};
  }
  var api = {languages:languages,levels:levels,koreaCities:cities,countries:countries,locationMarkup:locationMarkup,mountLocation:mountLocation,canHost:function (level) { return ['conversational','fluent','native'].includes(level); }};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DayOPartnerFields = api;
})(typeof window !== 'undefined' ? window : this);

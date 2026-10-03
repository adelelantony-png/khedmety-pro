/*!
 * courses-module.js — إضافة "المواد والكتل والامتحانات" لتطبيق خدمتي برو
 * التركيب: ضع الملف بجوار index.html ثم أضف قبل </body>:
 *   <script src="courses-module.js"></script>
 * لا يعدّل أي كود موجود. يضيف تبويب "المواد والامتحانات 🎓" ويحفظ بياناته
 * محلياً (localStorage) وفي Firebase تحت المسار courses_module لو السحابة مفعّلة.
 */
(function () {
  'use strict';

  var LS_KEY = 'khedmety_courses_v1';
  var STAGES = { 1: 'سنة أولى', 2: 'سنة ثانية' };
  var CFG = window.KHEDMETY_COURSES_CONFIG || {};
  var ui = { view: 'courses', year: 1, examBlock: null };

  /* ---------- الحالة والحفظ ---------- */
  function defaults() {
    return {
      courses: [], blocks: [], grades: {},
      settings: { start: { 1: '', 2: '' }, weekday: 5, pattern: '2,2,3', skip: '', max: 100, passPct: 50 },
      updatedAt: 0
    };
  }
  function norm(v) {
    var d = defaults();
    v = v || {};
    d.courses = (v.courses || []).filter(Boolean);
    d.blocks = (v.blocks || []).filter(Boolean).map(function (b) { b.courseIds = b.courseIds || []; return b; });
    d.grades = v.grades || {};
    var s = v.settings || {};
    d.settings = Object.assign(d.settings, s);
    d.settings.start = Object.assign({ 1: '', 2: '' }, s.start || {});
    d.updatedAt = v.updatedAt || 0;
    return d;
  }
  function load() {
    try { return norm(JSON.parse(localStorage.getItem(LS_KEY))); } catch (e) { return defaults(); }
  }
  var state = load();

  function cloudReady() {
    try { return typeof isFirebaseActive !== 'undefined' && isFirebaseActive && typeof db !== 'undefined' && db; } catch (e) { return false; }
  }
  function save() {
    state.updatedAt = Date.now();
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    if (cloudReady()) { try { db.ref('courses_module').set(state).catch(function () {}); } catch (e) {} }
  }
  function pullCloud() {
    if (!cloudReady()) return;
    try {
      db.ref('courses_module').once('value').then(function (snap) {
        var v = snap.val();
        if (v && (v.updatedAt || 0) > (state.updatedAt || 0)) {
          state = norm(v);
          localStorage.setItem(LS_KEY, JSON.stringify(state));
          render();
        }
      }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- أدوات ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid(p) { return p + '_' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36); }
  function toast(msg) {
    var t = document.getElementById('toastMessage');
    if (!t) { alert(msg); return; }
    t.textContent = msg; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function parseDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function coursesOf(y) { return state.courses.filter(function (c) { return c.year === y; }); }
  function blocksOf(y) { return state.blocks.filter(function (b) { return b.year === y; }); }
  function courseById(id) { return state.courses.filter(function (c) { return c.id === id; })[0]; }

  /* ---------- الدارسين (يُقرأ من التطبيق الأساسي) ---------- */
  function getMembers() {
    var raw = null;
    try {
      if (CFG.getMembers) raw = CFG.getMembers();
      else if (typeof members !== 'undefined') raw = members;
      else if (typeof membersList !== 'undefined') raw = membersList;
      else if (typeof students !== 'undefined') raw = students;
      else if (typeof allMembers !== 'undefined') raw = allMembers;
    } catch (e) { raw = null; }
    if (!raw) return null;
    var arr = Array.isArray(raw) ? raw : Object.keys(raw).map(function (k) { var o = raw[k]; if (o && !o.code && !o.examCode) o.__k = k; return o; });
    return arr.filter(Boolean).map(function (m) {
      return {
        code: String(m.code || m.examCode || m.exam_code || m.id || m.__k || ''),
        name: m.name || m.fullName || '',
        stage: m.stage || ''
      };
    }).filter(function (m) { return m.code; });
  }
  function membersOfYear(y) {
    var all = getMembers();
    if (!all) return null;
    return all.filter(function (m) { return m.stage === STAGES[y]; });
  }

  /* ---------- الكتل والخطة ---------- */
  function rebuildBlocks(y) {
    var sizes = String(state.settings.pattern || '2').split(/[,\s،]+/).map(Number).filter(function (n) { return n > 0; });
    if (!sizes.length) sizes = [2];
    var list = coursesOf(y), i = 0, k = 0, out = [];
    while (i < list.length) {
      var n = sizes[Math.min(k, sizes.length - 1)];
      out.push({ id: uid('blk'), year: y, courseIds: list.slice(i, i + n).map(function (c) { return c.id; }) });
      i += n; k++;
    }
    state.blocks = state.blocks.filter(function (b) { return b.year !== y; }).concat(out);
  }
  function schedule(y) {
    var s = state.settings;
    if (!s.start[y]) return [];
    var skip = {};
    String(s.skip || '').split(/[\s,،]+/).filter(Boolean).forEach(function (x) { skip[x] = 1; });
    var d = parseDate(s.start[y]);
    while (d.getDay() !== Number(s.weekday)) d.setDate(d.getDate() + 1);
    function next() {
      var x;
      do { x = iso(d); d.setDate(d.getDate() + 7); } while (skip[x]);
      return x;
    }
    var rows = [];
    blocksOf(y).forEach(function (b, bi) {
      var cs = b.courseIds.map(courseById).filter(Boolean);
      cs.forEach(function (c) {
        for (var i = 1; i <= c.weeks; i++) {
          rows.push({ date: next(), type: 'محاضرة', title: c.name + ' (' + i + '/' + c.weeks + ')', stage: STAGES[y], who: c.lecturer || '', blockId: b.id });
        }
      });
      if (cs.length) {
        rows.push({ date: next(), type: 'امتحان', title: 'امتحان الكتلة ' + (bi + 1) + ': ' + cs.map(function (c) { return c.name; }).join(' + '), stage: STAGES[y], who: '', blockId: b.id });
      }
    });
    return rows;
  }
  function blockLabel(b, i) {
    return 'الكتلة ' + (i + 1) + ': ' + b.courseIds.map(function (id) { var c = courseById(id); return c ? c.name : '؟'; }).join(' + ');
  }

  /* ---------- الدرجات والنتائج ---------- */
  function passMark() { return (Number(state.settings.max) || 100) * (Number(state.settings.passPct) || 50) / 100; }
  function statusOf(blockId, code) {
    var g = (state.grades[blockId] || {})[code];
    if (g === undefined || g === null || g === '') return 'none';
    return Number(g) >= passMark() ? 'pass' : 'fail';
  }
  function yearResult(y, code) {
    var bl = blocksOf(y);
    if (!bl.length) return 'none';
    var res = bl.map(function (b) { return statusOf(b.id, code); });
    if (res.indexOf('fail') > -1) return 'fail';
    if (res.indexOf('none') > -1) return 'pending';
    return 'pass';
  }
  // للاستخدام من بقية التطبيق: هل اجتاز الدارس كل امتحانات فرقته؟
  function isEligible(code, y) { return yearResult(y || 1, String(code)) === 'pass'; }

  /* ---------- الواجهة ---------- */
  function mount() {
    var tabs = document.querySelector('.tabs');
    var container = document.getElementById('mainApp');
    if (!tabs || !container || document.getElementById('coursesTab')) return;
    var btn = document.createElement('div');
    btn.className = 'tab-btn';
    btn.textContent = 'المواد والامتحانات 🎓';
    btn.onclick = function () { switchTab('coursesTab', btn); pullCloud(); render(); };
    var planBtn = tabs.children[1];
    tabs.insertBefore(btn, planBtn ? planBtn.nextSibling : null);
    var div = document.createElement('div');
    div.id = 'coursesTab';
    div.className = 'tab-content';
    container.appendChild(div);
    render();
  }

  function nav() {
    var items = [['courses', 'المواد 📚'], ['plan', 'الكتل والخطة 🗓️'], ['grades', 'الدرجات ✍️'], ['results', 'النتائج 🏅']];
    return '<div style="margin-bottom:10px;">' + items.map(function (it) {
      return '<span class="capsule-btn ' + (ui.view === it[0] ? 'active' : '') + '" onclick="CM.go(\'' + it[0] + '\')">' + it[1] + '</span>';
    }).join('') + '</div>' +
      '<div style="margin-bottom:10px;"><label style="font-weight:bold;font-size:13px;">الفرقة: </label>' +
      '<select style="width:auto;display:inline-block;" onchange="CM.setYear(this.value)">' +
      '<option value="1"' + (ui.year === 1 ? ' selected' : '') + '>سنة أولى</option>' +
      '<option value="2"' + (ui.year === 2 ? ' selected' : '') + '>سنة ثانية</option></select></div>';
  }

  function progressBanner() {
    var today = iso(new Date());
    var rows = schedule(ui.year);
    if (!rows.length) return '';
    var up = rows.filter(function (r) { return r.date >= today; })[0];
    if (!up) return '<div style="background:#e8f8f5;border:1px solid #55efc4;padding:10px;border-radius:8px;margin-bottom:10px;font-size:13px;">✅ انتهت كل محطات خطة ' + STAGES[ui.year] + '.</div>';
    var nextExam = rows.filter(function (r) { return r.date >= today && r.type === 'امتحان'; })[0];
    return '<div style="background:#e8f4fd;border:1px solid #74b9ff;padding:10px;border-radius:8px;margin-bottom:10px;font-size:13px;line-height:1.7;">' +
      '<strong>المحطة القادمة:</strong> ' + esc(up.date) + ' — ' + esc(up.title) + (up.who ? ' (' + esc(up.who) + ')' : '') +
      (nextExam ? '<br><strong>أقرب امتحان:</strong> ' + esc(nextExam.date) + ' — ' + esc(nextExam.title) : '') + '</div>';
  }

  function viewCourses() {
    var y = ui.year, list = coursesOf(y);
    var h = '<div class="admin-only" style="background:#fdfefe;border:2px dashed var(--primary);padding:12px;border-radius:8px;margin-bottom:12px;">' +
      '<h4 style="margin:0 0 8px 0;color:var(--primary);">➕ إضافة مادة إلى ' + STAGES[y] + '</h4>' +
      '<div class="form-grid">' +
      '<div class="form-group"><label>اسم المادة</label><input id="cm_name" type="text" placeholder="مثال: العقيدة"></div>' +
      '<div class="form-group"><label>المحاضر</label><input id="cm_lect" type="text" placeholder="اسم الخادم"></div>' +
      '<div class="form-group"><label>عدد الأسابيع</label><input id="cm_weeks" type="number" min="1" value="4"></div></div>' +
      '<button class="btn-success" onclick="CM.addCourse()">حفظ المادة</button>' +
      '<details style="margin-top:6px;"><summary style="font-size:12px;cursor:pointer;">إضافة عدة مواد دفعة واحدة (اسم في كل سطر)</summary>' +
      '<textarea id="cm_bulk" rows="4" placeholder="العقيدة&#10;الطقوس&#10;الكتاب المقدس"></textarea>' +
      '<button class="btn-primary" onclick="CM.addBulk()" style="margin-top:6px;">إضافة الكل (٤ أسابيع لكل مادة)</button></details></div>';
    if (!list.length) return h + '<div class="empty-state">لا توجد مواد لـ' + STAGES[y] + ' بعد. المطلوب ٧ مواد.</div>';
    h += '<div style="font-size:12px;color:#636e72;margin-bottom:6px;">عدد المواد: ' + list.length + ' من ٧ — الترتيب هنا هو ترتيب الدراسة.</div>' +
      '<div class="table-responsive"><table class="adaptive-card-table"><thead><tr><th>#</th><th>المادة</th><th>المحاضر</th><th>الأسابيع</th><th class="admin-only">إجراء</th></tr></thead><tbody>';
    list.forEach(function (c, i) {
      h += '<tr><td data-label="#">' + (i + 1) + '</td><td data-label="المادة">' + esc(c.name) + '</td><td data-label="المحاضر">' + esc(c.lecturer || '—') + '</td><td data-label="الأسابيع">' + c.weeks + '</td>' +
        '<td data-label="إجراء" class="admin-only"><button class="btn-mini btn-primary" onclick="CM.move(\'' + c.id + '\',-1)">▲</button> ' +
        '<button class="btn-mini btn-primary" onclick="CM.move(\'' + c.id + '\',1)">▼</button> ' +
        '<button class="btn-mini btn-warning" onclick="CM.editCourse(\'' + c.id + '\')">تعديل</button> ' +
        '<button class="btn-mini btn-danger" onclick="CM.delCourse(\'' + c.id + '\')">حذف</button></td></tr>';
    });
    return h + '</tbody></table></div>';
  }

  function viewPlan() {
    var y = ui.year, s = state.settings, bl = blocksOf(y);
    var days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    var h = '<div class="admin-only" style="background:#f8f9fa;border:1px solid #dfe6e9;padding:12px;border-radius:8px;margin-bottom:12px;">' +
      '<div class="form-grid">' +
      '<div class="form-group"><label>تاريخ بداية الدراسة (' + STAGES[y] + ')</label><input id="cm_start" type="date" value="' + esc(s.start[y]) + '"></div>' +
      '<div class="form-group"><label>يوم الاجتماع</label><select id="cm_weekday">' +
      days.map(function (d, i) { return '<option value="' + i + '"' + (Number(s.weekday) === i ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><label>عدد مواد كل كتلة (يتكرر الأخير)</label><input id="cm_pattern" type="text" value="' + esc(s.pattern) + '" placeholder="2,2,3"></div>' +
      '<div class="form-group"><label>تواريخ توقف (امتحانات الجامعة) — YYYY-MM-DD</label><input id="cm_skip" type="text" value="' + esc(s.skip) + '" placeholder="2027-01-08, 2027-01-15"></div></div>' +
      '<button class="btn-primary" onclick="CM.savePlanSettings(true)">تقسيم المواد إلى كتل وتوليد الخطة 🚀</button>' +
      '<button class="btn-success" onclick="CM.savePlanSettings(false)">حفظ الإعدادات فقط</button></div>';
    if (!bl.length) return h + '<div class="empty-state">أضف المواد أولاً ثم اضغط "تقسيم المواد إلى كتل".</div>';
    h += '<h4 style="color:var(--primary);margin:8px 0;">الكتل</h4>' + bl.map(function (b, i) {
      return '<div style="background:#fff;border:1px solid #dfe6e9;border-right:4px solid var(--purple);padding:8px 10px;border-radius:8px;margin-bottom:6px;font-size:13px;">' + esc(blockLabel(b, i)) + '</div>';
    }).join('');
    var rows = schedule(y);
    if (rows.length) {
      h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px;flex-wrap:wrap;"><h4 style="color:var(--primary);margin:0;">الجدول المتتابع (' + rows.length + ' محطة)</h4>' +
        '<button class="btn-mini btn-success" onclick="CM.exportPlan()">📊 تصدير Excel</button></div>' +
        '<div class="table-responsive"><table class="adaptive-card-table"><thead><tr><th>التاريخ</th><th>النوع</th><th>العنوان</th><th>المحاضر</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr' + (r.type === 'امتحان' ? ' style="background:#fff3cd;font-weight:bold;"' : '') + '><td data-label="التاريخ">' + esc(r.date) + '</td><td data-label="النوع">' + esc(r.type) + '</td><td data-label="العنوان">' + esc(r.title) + '</td><td data-label="المحاضر">' + esc(r.who || '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    return h;
  }

  function noMembersMsg() {
    return '<div class="empty-state" style="background:#fff3cd;border-radius:8px;color:#856404;line-height:1.7;">لم أستطع قراءة قائمة الدارسين من التطبيق.<br>' +
      'عرّف قبل تحميل الملف: <code dir="ltr">window.KHEDMETY_COURSES_CONFIG = { getMembers: function(){ return YOUR_MEMBERS_ARRAY; } }</code></div>';
  }

  function viewGrades() {
    var y = ui.year, bl = blocksOf(y);
    if (!bl.length) return '<div class="empty-state">لا توجد كتل بعد. ولّد الخطة أولاً من تبويب "الكتل والخطة".</div>';
    if (!ui.examBlock || !bl.some(function (b) { return b.id === ui.examBlock; })) ui.examBlock = bl[0].id;
    var ms = membersOfYear(y);
    var h = '<div class="admin-only" style="background:#f8f9fa;border:1px solid #dfe6e9;padding:10px;border-radius:8px;margin-bottom:10px;"><div class="form-grid">' +
      '<div class="form-group"><label>الدرجة العظمى</label><input id="cm_max" type="number" value="' + esc(state.settings.max) + '" onchange="CM.saveGradeSettings()"></div>' +
      '<div class="form-group"><label>نسبة النجاح %</label><input id="cm_pct" type="number" value="' + esc(state.settings.passPct) + '" onchange="CM.saveGradeSettings()"></div></div></div>' +
      '<div class="form-group" style="margin-bottom:10px;"><label>اختر الامتحان</label><select onchange="CM.setBlock(this.value)">' +
      bl.map(function (b, i) { return '<option value="' + b.id + '"' + (b.id === ui.examBlock ? ' selected' : '') + '>' + esc(blockLabel(b, i)) + '</option>'; }).join('') + '</select></div>';
    if (!ms) return h + noMembersMsg();
    if (!ms.length) return h + '<div class="empty-state">لا يوجد دارسون مسجلون في ' + STAGES[y] + '.</div>';
    var g = state.grades[ui.examBlock] || {};
    h += '<div style="font-size:12px;color:#636e72;margin-bottom:6px;">درجة النجاح: ' + passMark() + ' — اترك الخانة فارغة لمن لم يمتحن.</div>' +
      '<div class="table-responsive"><table class="adaptive-card-table"><thead><tr><th>الكود</th><th>الاسم</th><th>الدرجة</th><th>الحالة</th></tr></thead><tbody>';
    ms.forEach(function (m) {
      var st = statusOf(ui.examBlock, m.code);
      var label = st === 'pass' ? '✅ ناجح' : st === 'fail' ? '❌ راسب (ملحق)' : '— لم يمتحن';
      h += '<tr><td data-label="الكود">' + esc(m.code) + '</td><td data-label="الاسم">' + esc(m.name) + '</td>' +
        '<td data-label="الدرجة"><input type="number" style="width:90px;" value="' + esc(g[m.code] === undefined ? '' : g[m.code]) + '" onchange="CM.setGrade(\'' + esc(m.code) + '\',this.value)"></td>' +
        '<td data-label="الحالة">' + label + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }

  function viewResults() {
    var y = ui.year, bl = blocksOf(y), ms = membersOfYear(y);
    if (!bl.length) return '<div class="empty-state">لا توجد كتل بعد.</div>';
    if (!ms) return noMembersMsg();
    if (!ms.length) return '<div class="empty-state">لا يوجد دارسون في ' + STAGES[y] + '.</div>';
    var tag = { pass: '✅ اجتاز', fail: '❌ عليه ملحق', pending: '⏳ لم يكمل', none: '—' };
    var okCount = ms.filter(function (m) { return yearResult(y, m.code) === 'pass'; }).length;
    var h = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">' +
      '<div style="font-size:13px;font-weight:bold;">اجتازوا كل الامتحانات: ' + okCount + ' من ' + ms.length + '</div>' +
      '<button class="btn-mini btn-success" onclick="CM.exportResults()">📊 تصدير Excel</button></div>' +
      '<div class="table-responsive"><table class="adaptive-card-table"><thead><tr><th>الكود</th><th>الاسم</th>' +
      bl.map(function (b, i) { return '<th>كتلة ' + (i + 1) + '</th>'; }).join('') + '<th>النتيجة</th></tr></thead><tbody>';
    ms.forEach(function (m) {
      h += '<tr><td data-label="الكود">' + esc(m.code) + '</td><td data-label="الاسم">' + esc(m.name) + '</td>' +
        bl.map(function (b, i) {
          var v = (state.grades[b.id] || {})[m.code];
          var st = statusOf(b.id, m.code);
          return '<td data-label="كتلة ' + (i + 1) + '" style="color:' + (st === 'fail' ? 'var(--danger)' : st === 'pass' ? 'var(--success)' : '#888') + ';">' + (v === undefined || v === '' ? '—' : esc(v)) + '</td>';
        }).join('') + '<td data-label="النتيجة">' + tag[yearResult(y, m.code)] + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }

  function render() {
    var el = document.getElementById('coursesTab');
    if (!el) return;
    var body = ui.view === 'plan' ? viewPlan() : ui.view === 'grades' ? viewGrades() : ui.view === 'results' ? viewResults() : viewCourses();
    el.innerHTML = '<h2>🎓 المواد والكتل والامتحانات</h2>' +
      '<p style="font-size:12px;color:#636e72;margin-top:0;">دراسة متتابعة: كل كتلة (٢ أو ٣ مواد) يعقبها امتحان، ثم الكتلة التالية.</p>' +
      nav() + progressBanner() + body;
  }

  /* ---------- الإجراءات ---------- */
  function exportXlsx(rows, headers, name) {
    if (typeof XLSX === 'undefined') { alert('مكتبة Excel غير محمّلة.'); return; }
    var data = [headers].concat(rows);
    var ws = XLSX.utils.aoa_to_sheet(data), wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, name);
  }

  window.CM = {
    go: function (v) { ui.view = v; render(); },
    setYear: function (v) { ui.year = Number(v); ui.examBlock = null; render(); },
    setBlock: function (v) { ui.examBlock = v; render(); },

    addCourse: function () {
      var n = document.getElementById('cm_name').value.trim();
      if (!n) { toast('اكتب اسم المادة'); return; }
      state.courses.push({
        id: uid('crs'), year: ui.year, name: n,
        lecturer: document.getElementById('cm_lect').value.trim(),
        weeks: Math.max(1, parseInt(document.getElementById('cm_weeks').value, 10) || 4)
      });
      save(); render(); toast('تمت إضافة المادة');
    },
    addBulk: function () {
      var lines = document.getElementById('cm_bulk').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      if (!lines.length) return;
      lines.forEach(function (n) { state.courses.push({ id: uid('crs'), year: ui.year, name: n, lecturer: '', weeks: 4 }); });
      save(); render(); toast('تمت إضافة ' + lines.length + ' مادة');
    },
    editCourse: function (id) {
      var c = courseById(id); if (!c) return;
      var n = prompt('اسم المادة:', c.name); if (n === null) return;
      var l = prompt('المحاضر:', c.lecturer || ''); if (l === null) return;
      var w = prompt('عدد الأسابيع:', c.weeks); if (w === null) return;
      c.name = n.trim() || c.name; c.lecturer = l.trim(); c.weeks = Math.max(1, parseInt(w, 10) || c.weeks);
      save(); render();
    },
    delCourse: function (id) {
      if (!confirm('حذف المادة؟ سيتم إلغاء الكتل الحالية لهذه الفرقة لإعادة توليدها.')) return;
      var c = courseById(id); if (!c) return;
      state.courses = state.courses.filter(function (x) { return x.id !== id; });
      state.blocks = state.blocks.filter(function (b) { return b.year !== c.year; });
      save(); render();
    },
    move: function (id, dir) {
      var c = courseById(id); if (!c) return;
      var idxs = [];
      state.courses.forEach(function (x, i) { if (x.year === c.year) idxs.push(i); });
      var pos = idxs.indexOf(state.courses.indexOf(c)), tgt = pos + dir;
      if (tgt < 0 || tgt >= idxs.length) return;
      var a = idxs[pos], b = idxs[tgt], tmp = state.courses[a];
      state.courses[a] = state.courses[b]; state.courses[b] = tmp;
      state.blocks = state.blocks.filter(function (x) { return x.year !== c.year; });
      save(); render();
    },

    savePlanSettings: function (rebuild) {
      var s = state.settings;
      s.start[ui.year] = document.getElementById('cm_start').value;
      s.weekday = Number(document.getElementById('cm_weekday').value);
      s.pattern = document.getElementById('cm_pattern').value.trim() || '2';
      s.skip = document.getElementById('cm_skip').value.trim();
      if (rebuild) {
        if (!coursesOf(ui.year).length) { toast('أضف المواد أولاً'); return; }
        if (blocksOf(ui.year).length && !confirm('إعادة التقسيم ستستبدل الكتل الحالية (الدرجات المسجلة للكتل القديمة لن تظهر). متابعة؟')) return;
        rebuildBlocks(ui.year);
      }
      save(); render(); toast(rebuild ? 'تم توليد الخطة' : 'تم الحفظ');
    },
    exportPlan: function () {
      // نفس ترتيب أعمدة نموذج خطة السنة: تحقق منه بزر "تحميل نموذج الخطة فارغ" قبل الاستيراد
      var rows = schedule(ui.year).map(function (r) { return [r.date, r.type, r.title, '', r.stage, r.who]; });
      exportXlsx(rows, ['التاريخ', 'النوع', 'عنوان الفعالية', 'المكان', 'المرحلة', 'المسؤول'], 'خطة_المواد_' + STAGES[ui.year] + '.xlsx');
    },

    saveGradeSettings: function () {
      state.settings.max = Number(document.getElementById('cm_max').value) || 100;
      state.settings.passPct = Number(document.getElementById('cm_pct').value) || 50;
      save(); render();
    },
    setGrade: function (code, v) {
      if (!state.grades[ui.examBlock]) state.grades[ui.examBlock] = {};
      if (v === '') delete state.grades[ui.examBlock][code];
      else state.grades[ui.examBlock][code] = Number(v);
      save(); render();
    },
    exportResults: function () {
      var y = ui.year, bl = blocksOf(y), ms = membersOfYear(y) || [];
      var names = { pass: 'اجتاز', fail: 'عليه ملحق', pending: 'لم يكمل', none: '' };
      var rows = ms.map(function (m) {
        return [m.code, m.name].concat(bl.map(function (b) { var v = (state.grades[b.id] || {})[m.code]; return v === undefined ? '' : v; })).concat([names[yearResult(y, m.code)]]);
      });
      exportXlsx(rows, ['الكود', 'الاسم'].concat(bl.map(function (b, i) { return 'كتلة ' + (i + 1); })).concat(['النتيجة']), 'نتائج_' + STAGES[y] + '.xlsx');
    }
  };

  // واجهة للتكامل مع بقية التطبيق (مثلاً شرط التخرج)
  window.CoursesModule = {
    isEligible: isEligible,
    yearResult: yearResult,
    getState: function () { return state; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();

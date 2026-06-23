const STATUSES = ["present", "late", "absent"];

const db = {
  classes: [
    { id: "tvlios1", name: "Grade 12 - IOS (ICT)"},
    { id: "tvlios2", name: "Grade 12 - IOS (HE)"},
  ],
  students: [
    { id: "s1", classId: "tvlios1", name: "Fritz Vohn M. Dayday" },
    { id: "s2", classId: "tvlios1", name: "Prince Darwin Adajar Hurano" },
    { id: "s3", classId: "tvlios1", name: "Lloyd Justine Pelare" },
    { id: "s4", classId: "tvlios2", name: "Rich Anne Saguing" },
    { id: "s5", classId: "tvlios2", name: "Orlyn Mae Ociones" },
    { id: "s6", classId: "tvlios2", name: "Jasmine Pahuyo" },
  ],
  // attendance: { "classId|date": { studentId: status } }
  attendance: {},
};

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function formatDateLong(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatDateShort(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function recordKey(classId, date) {
  return classId + "|" + date;
}

/* ---- seed some recent history so Daily Records / Summary aren't empty ---- */
(function seed() {
  const today = new Date();
  for (let offset = 1; offset <= 0; offset++) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const iso = d.toISOString().slice(0, 10);
    db.classes.forEach((cls) => {
      const studentsInClass = db.students.filter((s) => s.classId === cls.id);
      const dayRecord = {};
      studentsInClass.forEach((stu) => {
        const roll = Math.random();
        dayRecord[stu.id] = roll < 0.82 ? "present" : roll < 0.93 ? "late" : "absent";
      });
      db.attendance[recordKey(cls.id, iso)] = dayRecord;
    });
  }
})();

/* ---- "backend" functions: the only way the UI touches data ---- */

function getClasses() {
  return db.classes;
}

function getStudentsForClass(classId) {
  return db.students.filter((s) => s.classId === classId);
}

function getAttendanceForClassDate(classId, date) {
  return db.attendance[recordKey(classId, date)] || null;
}

function saveAttendanceForClassDate(classId, date, statusMap) {
  db.attendance[recordKey(classId, date)] = { ...statusMap };
  return true;
}

function getAllDatesWithRecordsForClass(classId) {
  return Object.keys(db.attendance)
    .filter((key) => key.startsWith(classId + "|"))
    .map((key) => key.split("|")[1])
    .sort((a, b) => (a < b ? 1 : -1));
}

function getStudentSummary(studentId) {
  const student = db.students.find((s) => s.id === studentId);
  if (!student) return null;
  const counts = { present: 0, late: 0, absent: 0 };
  const history = [];
  Object.keys(db.attendance).forEach((key) => {
    const [classId, date] = key.split("|");
    if (classId !== student.classId) return;
    const status = db.attendance[key][studentId];
    if (!status) return;
    counts[status]++;
    history.push({ date, status });
  });
  history.sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = counts.present + counts.late + counts.absent;
  const rate = total > 0 ? Math.round(((counts.present + counts.late) / total) * 100) : 0;
  return { student, counts, history, total, rate };
}

/* =========================================================================
   FRONT END / UI LAYER
   ========================================================================= */

const panel = document.getElementById("panel");
document.getElementById("todayLabel").textContent = formatDateLong(todayISO());

let activeTab = "take";
let takeState = { classId: db.classes[0].id, date: todayISO(), draft: {} };
let dailyState = { classId: db.classes[0].id, date: todayISO() };
let summaryState = { studentId: null };

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    render();
  });
});

function render() {
  if (activeTab === "take") renderTake();
  else if (activeTab === "daily") renderDaily();
  else renderSummary();
}

/* ---------------- TAB 1: Take Attendance ---------------- */

function renderTake() {
  const classOptions = db.classes
    .map((c) => `<option value="${c.id}" ${c.id === takeState.classId ? "selected" : ""}>${c.name}</option>`)
    .join("");

  const students = getStudentsForClass(takeState.classId);
  const existing = getAttendanceForClassDate(takeState.classId, takeState.date);

  // initialize draft from saved record (or default to "present") whenever class/date changes
  const draftKey = takeState.classId + "|" + takeState.date;
  if (takeState._loadedKey !== draftKey) {
    takeState.draft = {};
    students.forEach((s) => {
      takeState.draft[s.id] = (existing && existing[s.id]) || "present";
    });
    takeState._loadedKey = draftKey;
  }

  const rosterHTML = students
    .map((s, i) => `
      <div class="roster-row">
        <div class="num">${i + 1}.</div>
        <div class="name">${s.name}</div>
        <div class="status-group" data-student="${s.id}">
          ${STATUSES.map(
            (st) => `<button class="status-btn" data-status="${st}" data-student="${s.id}">${capitalize(st)}</button>`
          ).join("")}
        </div>
      </div>
    `)
    .join("");

  panel.innerHTML = `
    <div class="panel-heading">
      <div>
        <h2>Take Attendance</h2>
        <p>Mark every student, then save the day's record.</p>
      </div>
    </div>
    <div class="controls-row">
      <div class="field">
        <label for="takeClass">Class</label>
        <select id="takeClass">${classOptions}</select>
      </div>
      <div class="field">
        <label for="takeDate">Date</label>
        <input type="date" id="takeDate" value="${takeState.date}" />
      </div>
    </div>
    <div class="roster">${rosterHTML || `<div class="empty-state">No students found for this class.</div>`}</div>
    <div class="roster-actions">
      <button class="quick-mark" id="markAllPresent">Mark everyone present</button>
      <div style="display:flex; align-items:center; gap:14px;">
        <span class="save-confirm" id="saveConfirm">Saved &#10003;</span>
        <button class="primary-btn" id="saveAttendance">Save attendance</button>
      </div>
    </div>
  `;

  // reflect current draft state on buttons
  students.forEach((s) => {
    const group = panel.querySelector(`.status-group[data-student="${s.id}"]`);
    const current = takeState.draft[s.id];
    group.querySelectorAll(".status-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.status === current);
    });
  });

  document.getElementById("takeClass").addEventListener("change", (e) => {
    takeState.classId = e.target.value;
    renderTake();
  });

  document.getElementById("takeDate").addEventListener("change", (e) => {
    takeState.date = e.target.value || todayISO();
    renderTake();
  });

  panel.querySelectorAll(".status-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const studentId = btn.dataset.student;
      takeState.draft[studentId] = btn.dataset.status;
      const group = panel.querySelector(`.status-group[data-student="${studentId}"]`);
      group.querySelectorAll(".status-btn").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  document.getElementById("markAllPresent").addEventListener("click", () => {
    students.forEach((s) => (takeState.draft[s.id] = "present"));
    renderTake();
  });

  document.getElementById("saveAttendance").addEventListener("click", () => {
    saveAttendanceForClassDate(takeState.classId, takeState.date, takeState.draft);
    const confirm = document.getElementById("saveConfirm");
    confirm.classList.add("show");
    setTimeout(() => confirm.classList.remove("show"), 1600);
  });
}

/* ---------------- TAB 2: Daily Records ---------------- */

function renderDaily() {
  const classOptions = db.classes
    .map((c) => `<option value="${c.id}" ${c.id === dailyState.classId ? "selected" : ""}>${c.name}</option>`)
    .join("");

  const students = getStudentsForClass(dailyState.classId);
  const record = getAttendanceForClassDate(dailyState.classId, dailyState.date);

  let rowsHTML;
  if (!record) {
    rowsHTML = `<tr><td colspan="2"><div class="empty-state">No attendance has been recorded for this class on this date yet.</div></td></tr>`;
  } else {
    rowsHTML = students
      .map((s) => {
        const status = record[s.id];
        const pillClass = status || "none";
        const label = status ? capitalize(status) : "Not marked";
        return `<tr><td>${s.name}</td><td><span class="pill ${pillClass}">${label}</span></td></tr>`;
      })
      .join("");
  }

  const tallies = students.reduce(
    (acc, s) => {
      const st = record && record[s.id];
      if (st) acc[st]++;
      return acc;
    },
    { present: 0, late: 0, absent: 0 }
  );

  panel.innerHTML = `
    <div class="panel-heading">
      <div>
        <h2>Daily Records</h2>
        <p>${formatDateLong(dailyState.date)}</p>
      </div>
    </div>
    <div class="controls-row">
      <div class="field">
        <label for="dailyClass">Class</label>
        <select id="dailyClass">${classOptions}</select>
      </div>
      <div class="field">
        <label for="dailyDate">Date</label>
        <input type="date" id="dailyDate" value="${dailyState.date}" />
      </div>
    </div>
    ${
      record
        ? `<div class="rate-line"><strong>${tallies.present}</strong> present &middot; <strong>${tallies.late}</strong> late &middot; <strong>${tallies.absent}</strong> absent &middot; out of ${students.length} students</div>`
        : ""
    }
    <table class="records">
      <thead><tr><th>Student</th><th>Status</th></tr></thead>
      <tbody>${rowsHTML}</tbody>
    </table>
  `;

  document.getElementById("dailyClass").addEventListener("change", (e) => {
    dailyState.classId = e.target.value;
    renderDaily();
  });

  document.getElementById("dailyDate").addEventListener("change", (e) => {
    dailyState.date = e.target.value || todayISO();
    renderDaily();
  });
}

/* ---------------- TAB 3: Student Summary ---------------- */

function renderSummary() {
  if (!summaryState.studentId) {
    summaryState.studentId = db.students[0].id;
  }

  const studentOptionsByClass = db.classes
    .map((cls) => {
      const opts = getStudentsForClass(cls.id)
        .map((s) => `<option value="${s.id}" ${s.id === summaryState.studentId ? "selected" : ""}>${s.name}</option>`)
        .join("");
      return `<optgroup label="${cls.name}">${opts}</optgroup>`;
    })
    .join("");

  const data = getStudentSummary(summaryState.studentId);

  const historyHTML = data.history.length
    ? data.history
        .map(
          (h) => `<div class="history-row"><span class="date">${formatDateShort(h.date)}</span><span class="pill ${h.status}">${capitalize(h.status)}</span></div>`
        )
        .join("")
    : `<div class="empty-state">No attendance history recorded yet for this student.</div>`;

  panel.innerHTML = `
    <div class="panel-heading">
      <div>
        <h2>Student Summary</h2>
        <p>${data.student.name}</p>
      </div>
    </div>
    <div class="controls-row">
      <div class="field">
        <label for="summaryStudent">Student</label>
        <select id="summaryStudent">${studentOptionsByClass}</select>
      </div>
    </div>
    <div class="summary-grid">
      <div class="stat-card present"><div class="stat-num">${data.counts.present}</div><div class="stat-label">Present</div></div>
      <div class="stat-card late"><div class="stat-num">${data.counts.late}</div><div class="stat-label">Late</div></div>
      <div class="stat-card absent"><div class="stat-num">${data.counts.absent}</div><div class="stat-label">Absent</div></div>
    </div>
    <div class="rate-line">Attendance rate over ${data.total} recorded day${data.total === 1 ? "" : "s"}: <strong>${data.rate}%</strong></div>
    <div class="history-list">${historyHTML}</div>
  `;

  document.getElementById("summaryStudent").addEventListener("change", (e) => {
    summaryState.studentId = e.target.value;
    renderSummary();
  });
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

render();
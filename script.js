// script.js

// Человекочитаемые названия направлений
const DIRECTION_LABELS = {
    to_south: "к Ботанической",
    to_north: "к Проспекту Космонавтов",
};

let SCHEDULE = null;
let selectedStation = "";
let selectedDirection = "";
let dayTypeMode = "auto"; // auto | weekday | weekend
let tickTimer = null;

// Время Екатеринбурга (UTC+5) без бэкенда
function getYekbNow() {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const yekbMs = utcMs + 5 * 60 * 60000; // UTC+5
    return new Date(yekbMs);
}

function pad2(n) {
    return n.toString().padStart(2, "0");
}

function formatTime(d) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function isWeekend(date) {
    const wd = date.getDay(); // 0..6; 0=воскресенье
    return wd === 0 || wd === 6;
}

function resolveDayType(date) {
    if (dayTypeMode === "weekday") return "weekday";
    if (dayTypeMode === "weekend") return "weekend";
    return isWeekend(date) ? "weekend" : "weekday";
}

function formatDiffLong(ms) {
    if (ms <= 0) return "отправление прямо сейчас";

    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    const parts = [];
    if (h > 0) parts.push(`${h} ч`);
    if (m > 0) parts.push(`${m} мин`);
    parts.push(`${s} с`);

    return "через " + parts.join(" ");
}

function formatDiffCompact(ms) {
    if (ms <= 0) return "00:00";
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${pad2(m)}:${pad2(s)}`;
}

// Поиск ближайшего отправления (с учётом авто / ручного типа дня)
function getNextDeparture(stationName, directionKey) {
    if (!SCHEDULE || !SCHEDULE[stationName] || !SCHEDULE[stationName][directionKey]) {
        return null;
    }

    const now = getYekbNow();
    const todayType = resolveDayType(now);
    const dirData = SCHEDULE[stationName][directionKey];

    function buildDeparturesForDay(baseDate, dayType) {
        const res = [];
        const table = dirData[dayType];
        if (!table) return res;
        for (const hourStr of Object.keys(table)) {
            const hour = parseInt(hourStr, 10);
            const mins = table[hourStr] || [];
            for (const min of mins) {
                const d = new Date(baseDate.getTime());
                d.setHours(hour, min, 0, 0);
                res.push(d);
            }
        }
        res.sort((a, b) => a - b);
        return res;
    }

    const todayDeps = buildDeparturesForDay(now, todayType)
        .filter(d => d.getTime() >= now.getTime());

    if (todayDeps.length > 0) {
        return {
            departure: todayDeps[0],
            dayType: todayType,
            isTomorrow: false,
        };
    }

    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowType = resolveDayType(tomorrow);
    const tomorrowDeps = buildDeparturesForDay(tomorrow, tomorrowType);
    if (tomorrowDeps.length === 0) return null;

    return {
        departure: tomorrowDeps[0],
        dayType: tomorrowType,
        isTomorrow: true,
    };
}

// Обновление строки с текущим временем и подсказки по типу дня
function updateCurrentTimeAndDayHint() {
    const now = getYekbNow();
    const timeEl = document.getElementById("current-time");
    timeEl.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(
        now.getSeconds()
    )}`;

    const hint = document.getElementById("daytype-hint");
    const wd = now.getDay();
    const names = [
        "Воскресенье",
        "Понедельник",
        "Вторник",
        "Среда",
        "Четверг",
        "Пятница",
        "Суббота",
    ];
    const todayName = names[wd] || "";
    const weekend = isWeekend(now);

    if (dayTypeMode === "weekday") {
        hint.textContent = `${todayName} — принудительно выбран режим «рабочий день».`;
    } else if (dayTypeMode === "weekend") {
        hint.textContent = `${todayName} — принудительно выбран режим «выходной».`;
    } else {
        hint.textContent = `${todayName} — автоматически используется ${
            weekend ? "расписание выходного дня" : "расписание рабочего дня"
        }.`;
    }
}

// Рендер списка станций
function renderStations() {
    const select = document.getElementById("station-select");
    select.innerHTML = '<option value="">Выберите станцию…</option>';

    const names = Object.keys(SCHEDULE || {}).sort((a, b) =>
        a.localeCompare(b, "ru")
    );

    for (const name of names) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    }
}

// Рендер переключателя направлений
function renderDirections() {
    const container = document.getElementById("direction-container");
    container.innerHTML = "";

    const metaDirection = document.getElementById("meta-direction");
    metaDirection.textContent = "—";

    if (!selectedStation || !SCHEDULE || !SCHEDULE[selectedStation]) {
        const span = document.createElement("span");
        span.className = "text-xs text-slate-500";
        span.textContent = "Сначала выберите станцию";
        container.appendChild(span);
        selectedDirection = "";
        return;
    }

    const stationData = SCHEDULE[selectedStation];
    const dirKeys = Object.keys(stationData);

    if (dirKeys.length === 0) {
        const span = document.createElement("span");
        span.className = "text-xs text-slate-500";
        span.textContent = "Для этой станции нет направлений";
        container.appendChild(span);
        selectedDirection = "";
        return;
    }

    if (!selectedDirection || !stationData[selectedDirection]) {
        selectedDirection = dirKeys[0];
    }

    dirKeys.forEach((key) => {
        const label = document.createElement("label");
        label.className =
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs cursor-pointer bg-slate-950/70 border-slate-600 hover:border-cyan-400/80 transition";

        if (key === selectedDirection) {
            label.classList.add("border-cyan-400", "bg-cyan-500/15", "shadow");
        }

        const input = document.createElement("input");
        input.type = "radio";
        input.name = "direction";
        input.value = key;
        input.className = "hidden";
        input.checked = key === selectedDirection;

        input.addEventListener("change", () => {
            selectedDirection = key;
            renderDirections();
            updateAll();
        });

        const dot = document.createElement("span");
        dot.className =
            "w-2 h-2 rounded-full border border-slate-400/70 bg-slate-950";

        if (key === selectedDirection) {
            dot.classList.remove("border-slate-400/70", "bg-slate-950");
            dot.classList.add("bg-cyan-400", "border-transparent");
        }

        const text = document.createElement("span");
        text.textContent = DIRECTION_LABELS[key] || key;

        label.appendChild(input);
        label.appendChild(dot);
        label.appendChild(text);

        container.appendChild(label);
    });
}

// Обновление мета-информации о ближайшем поезде
function updateMeta(nextInfo) {
    const metaDeparture = document.getElementById("meta-departure");
    const metaDaytype = document.getElementById("meta-daytype");
    const metaStation = document.getElementById("meta-station");
    const metaDirection = document.getElementById("meta-direction");

    metaStation.textContent = selectedStation || "—";
    metaDirection.textContent = selectedDirection
        ? DIRECTION_LABELS[selectedDirection] || selectedDirection
        : "—";

    if (!nextInfo) {
        metaDeparture.textContent = "—";
        metaDaytype.textContent = "—";
        return;
    }

    metaDeparture.textContent =
        formatTime(nextInfo.departure) + (nextInfo.isTomorrow ? " (завтра)" : "");
    metaDaytype.textContent =
        nextInfo.dayType === "weekend" ? "выходной" : "рабочий";
}

// Рендер таблицы расписания
function renderTimetable(dayTypeForTable, nextInfo) {
    const container = document.getElementById("timetable-container");
    const caption = document.getElementById("timetable-caption");
    container.innerHTML = "";

    if (
        !SCHEDULE ||
        !selectedStation ||
        !selectedDirection ||
        !SCHEDULE[selectedStation] ||
        !SCHEDULE[selectedStation][selectedDirection]
    ) {
        caption.textContent = "Нет данных";
        const div = document.createElement("div");
        div.className = "text-xs text-slate-500 mt-1";
        div.textContent =
            "Выберите станцию и направление, чтобы увидеть расписание.";
        container.appendChild(div);
        return;
    }

    const dirData = SCHEDULE[selectedStation][selectedDirection];
    const tableData = dirData[dayTypeForTable];

    const dayLabel =
        dayTypeForTable === "weekend" ? "выходной день" : "рабочий день";

    caption.textContent = `${dayLabel}, станция «${selectedStation}», ${
        DIRECTION_LABELS[selectedDirection] || selectedDirection
    }`;

    if (!tableData) {
        const div = document.createElement("div");
        div.className = "text-xs text-slate-500 mt-1";
        div.textContent = "Для выбранного типа дня расписание отсутствует.";
        container.appendChild(div);
        return;
    }

    const table = document.createElement("table");
    table.className =
        "w-full text-[13px] border-separate border-spacing-y-[2px]";

    const thead = document.createElement("thead");
    thead.innerHTML =
        '<tr class="text-[10px] uppercase tracking-[0.16em] text-slate-400 bg-slate-950/95 sticky top-0"><th class="text-left px-2 py-1">Час</th><th class="text-left px-2 py-1">Минуты</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    const hours = Object.keys(tableData)
        .map((h) => parseInt(h, 10))
        .sort((a, b) => a - b);

    const highlightHour =
        nextInfo && !nextInfo.isTomorrow ? nextInfo.departure.getHours() : null;
    const highlightMinute =
        nextInfo && !nextInfo.isTomorrow ? nextInfo.departure.getMinutes() : null;

    hours.forEach((hour) => {
        const mins = tableData[hour.toString()] || [];
        const tr = document.createElement("tr");

        const baseRowClass = "hover:bg-slate-800/80 transition";
        let rowClass = baseRowClass + " bg-slate-900/70";

        if (
            nextInfo &&
            !nextInfo.isTomorrow &&
            hour === highlightHour &&
            mins.includes(highlightMinute)
        ) {
            rowClass =
                baseRowClass + " bg-cyan-500/15 border-l-2 border-cyan-400/80";
        }

        tr.className = rowClass;

        const tdHour = document.createElement("td");
        tdHour.className = "px-2 py-1 font-mono tabular-nums w-14";
        tdHour.textContent = pad2(hour);

        const tdMinutes = document.createElement("td");
        tdMinutes.className = "px-2 py-1 text-slate-300";

        const parts = mins.map((m) => {
            if (
                nextInfo &&
                !nextInfo.isTomorrow &&
                hour === highlightHour &&
                m === highlightMinute
            ) {
                return `<span class="font-semibold text-cyan-300">${pad2(m)}</span>`;
            }
            return `<span class="text-slate-400">${pad2(m)}</span>`;
        });

        tdMinutes.innerHTML = parts.join(" ");

        tr.appendChild(tdHour);
        tr.appendChild(tdMinutes);
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
}

// Основное обновление (тикает раз в секунду)
function updateAll() {
    updateCurrentTimeAndDayHint();

    const countdownDisplay = document.getElementById("countdown-display");
    const countdownEta = document.getElementById("countdown-eta");

    if (
        !SCHEDULE ||
        !selectedStation ||
        !selectedDirection ||
        !SCHEDULE[selectedStation] ||
        !SCHEDULE[selectedStation][selectedDirection]
    ) {
        countdownDisplay.textContent = "--:--";
        countdownEta.textContent = "Выберите станцию и направление";
        updateMeta(null);
        renderTimetable(resolveDayType(getYekbNow()), null);
        return;
    }

    const nextInfo = getNextDeparture(selectedStation, selectedDirection);
    if (!nextInfo) {
        countdownDisplay.textContent = "--:--";
        countdownEta.textContent = "Сегодня поездов по расписанию больше нет";
        updateMeta(null);
        renderTimetable(resolveDayType(getYekbNow()), null);
        return;
    }

    const now = getYekbNow();
    const diffMs = nextInfo.departure.getTime() - now.getTime();

    countdownDisplay.textContent = formatDiffCompact(diffMs);
    countdownEta.textContent = formatDiffLong(diffMs);
    updateMeta(nextInfo);

    const tableDayType = resolveDayType(now); // расписание «на сегодня»
    renderTimetable(tableDayType, nextInfo);
}

// Инициализация кнопок типа дня
function initDayTypeButtons() {
    const buttons = [
        document.getElementById("daytype-auto"),
        document.getElementById("daytype-weekday"),
        document.getElementById("daytype-weekend"),
    ];

    buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            dayTypeMode = btn.dataset.daytype;
            buttons.forEach((b) => {
                b.classList.remove("bg-cyan-500/15", "text-cyan-300", "shadow-sm");
                b.classList.add("text-slate-300");
            });
            if (dayTypeMode === "auto") {
                btn.classList.add("bg-cyan-500/15", "text-cyan-300", "shadow-sm");
            } else {
                btn.classList.add("bg-cyan-500/15", "text-cyan-300", "shadow-sm");
            }
            updateAll();
        });
    });
}

// Точка входа
document.addEventListener("DOMContentLoaded", () => {
    initDayTypeButtons();

    const stationSelect = document.getElementById("station-select");
    stationSelect.addEventListener("change", () => {
        selectedStation = stationSelect.value || "";
        selectedDirection = "";
        renderDirections();
        updateAll();
    });

    // Загружаем расписание из JSON (тот, который ты уже собрал)
    fetch("ekb_metro_schedule.json")
        .then((res) => res.json())
        .then((data) => {
            SCHEDULE = data;
            renderStations();
            renderDirections();
            updateAll();

            if (tickTimer) clearInterval(tickTimer);
            tickTimer = setInterval(updateAll, 1000);
        })
        .catch((err) => {
            console.error("Ошибка загрузки расписания:", err);
            const caption = document.getElementById("timetable-caption");
            caption.textContent = "Не удалось загрузить ekb_metro_schedule.json";
        });
});

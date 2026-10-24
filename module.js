import {
  F,
  S,
  R,
  C,
  live,
  rows,
  byId,
  unique,
  required,
  minor,
  amount,
  interval,
  noOverlap,
  changed,
  immutable,
  admin,
  totalLines,
  summary,
  clock,
  label,
} from "./core/rules.js";
const definition = {
  slug: "scopesum",
  reference: 63,
  title: "ScopeSum",
  description:
    "Предварительная смета проекта с себестоимостью, резервом и скидкой; подписанный договор не создаётся.",
  limitations:
    "Одна организация · Собственный сервер · Ручной ввод · Без банковских и внешних интеграций",
  collections: [
    C("projects", "Сметы", [
      F("name", "Проект"),
      F("client", "Заказчик"),
      S("currency", "Валюта", ["KZT", "USD", "KGS", "UZS"]),
      F("reserve", "Резерв, %", "number", { max: 100 }),
      F("discount", "Скидка", "money"),
      S("status", "Статус", [
        ["draft", "Черновик"],
        ["sent", "Отправка отмечена"],
        ["accepted", "Подтверждение отмечено"],
      ]),
    ]),
    C("lines", "Работы", [
      R("project", "Смета", "projects"),
      F("description", "Работа"),
      F("quantity", "Количество", "number", { min: 0.01, max: 100000 }),
      F("price", "Цена единицы", "money"),
      F("cost", "Себестоимость единицы", "money"),
    ]),
  ],
  validate(state, before, command, actor) {
    for (const p of rows(state, "projects")) {
      const total = totalLines(state, "lines", "project", p.id),
        gross = total + Math.round((total * p.reserve) / 100);
      required(minor(p.discount) <= gross, "Скидка превышает смету.");
      const old = changed(before, "projects", p.id);
      if (old?.status === "accepted")
        immutable(old, p, [
          "name",
          "client",
          "currency",
          "reserve",
          "discount",
          "status",
          "archived",
        ]);
      if (p.status !== "draft") required(total > 0, "В смете нет работ.");
    }
    for (const l of rows(state, "lines")) {
      const p = byId(state, "projects", l.project),
        old = changed(before, "lines", l.id),
        previousParent = old && byId(before, "projects", old.project);
      if (
        p.status !== "draft" ||
        (previousParent && previousParent.status !== "draft")
      )
        required(
          old && JSON.stringify(old) === JSON.stringify(l),
          "Работы можно менять и переносить только между черновиками смет.",
        );
    }
  },
  summarize(state) {
    return rows(state, "projects").map((p) => {
      const sale = totalLines(state, "lines", "project", p.id),
        cost = live(state, "lines")
          .filter((x) => x.project === p.id)
          .reduce((s, x) => s + Math.round(x.quantity * minor(x.cost)), 0),
        reserve = Math.round((sale * p.reserve) / 100),
        total = sale + reserve - minor(p.discount);
      return summary(
        p.name + " · " + p.currency,
        "Работы: " + amount(sale),
        "Резерв: " + amount(reserve),
        "Итог: " + amount(total),
        "Расчётная себестоимость: " + amount(cost),
        "Разница до налогов и прочих расходов: " + amount(total - cost),
      );
    });
  },
};
export default definition;

import assert from "node:assert/strict";
import test from "node:test";
import { parseListPage, parseListPageSize, listPageHref } from "../src/lib/list-pagination";

test("page parsing rejects invalid and excessive offsets", () => {
  for (const value of [undefined, "", "0", "-1", "1.5", "Infinity", "NaN", "99999999", ["2"]]) assert.equal(parseListPage(value), 1);
  assert.equal(parseListPage("2"), 2);
});

test("page links retain filters and encode user input", () => {
  assert.equal(listPageHref("/clientes", { busca: "Ana & João", pagina: "7" }, 2), "/clientes?busca=Ana+%26+Jo%C3%A3o&pagina=2");
  assert.equal(listPageHref("/clientes", { busca: "Ana", pagina: "7" }, 1), "/clientes?busca=Ana");
  assert.equal(listPageHref("/auditoria", {}, 1), "/auditoria");
  assert.equal(listPageHref("/clientes", { busca: "" }, 2), "/clientes?pagina=2");
});

test("page sizes use the shared allowlist and keep the configured default", () => {
  for (const size of [10, 20, 50, 100]) assert.equal(parseListPageSize(String(size)), size);
  for (const value of [undefined, "0", "-10", "9999", "10.0", ["50"]]) assert.equal(parseListPageSize(value, 50), 50);
  assert.equal(listPageHref("/clientes", { busca: "Ana", pagina: "7", linhas: "100" }, 1), "/clientes?busca=Ana&linhas=100");
});

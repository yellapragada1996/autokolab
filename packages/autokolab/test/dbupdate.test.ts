import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { aheadLine, appliedLine, autoMigrateOn, dbStatusLine, decide, fileLabel, tellLine, versionLabel } from "../src/setup/dbupdate.js";
import { applySchema, hideDbUrl } from "../src/setup/team.js";

const files = [10, 11, 12].map((v) => ({ version: v, path: `/x/sql/0${v}_${["agent_model", "effective_model", "merge_policy"][v - 10]}.sql` }));

describe("database update decision", () => {
  const cases: [number, number, boolean, boolean, string][] = [
    // live, helper, admin, auto → kind
    [12, 12, true, true, "up-to-date"],
    [12, 12, true, false, "up-to-date"],
    [12, 12, false, false, "up-to-date"],
    [11, 12, true, true, "apply"],
    [11, 12, true, false, "tell"],
    [11, 12, false, true, "behind"],
    [11, 12, false, false, "behind"],
    [13, 12, true, true, "ahead"],
    [13, 12, true, false, "ahead"],
    [13, 12, false, false, "ahead"],
  ];
  for (const [live, helper, admin, auto, kind] of cases) {
    it(`live ${live}, helper ${helper}, ${admin ? "admin" : "not admin"}, auto ${auto ? "on" : "off"} → ${kind}`, () => {
      expect(decide({ live, helper, admin, auto }).kind).toBe(kind);
    });
  }

  it("is off unless turned on", () => {
    expect(autoMigrateOn({})).toBe(false);
    expect(autoMigrateOn({ auto_migrate: false })).toBe(false);
    expect(autoMigrateOn({ auto_migrate: true })).toBe(true);
  });
});

describe("database update wording", () => {
  it("names the pending files", () => {
    expect(fileLabel("/a/b/012_merge_policy.sql")).toBe("merge policy");
    expect(versionLabel(11, 12, files)).toBe("version 12 (merge policy)");
    expect(versionLabel(9, 12, files)).toBe("version 12 (agent model, effective model, merge policy)");
    expect(appliedLine(11, 12, files)).toBe("Updated the database to version 12 (merge policy).");
    expect(tellLine(11, 12, files)).toContain("A database update is ready (version 12 (merge policy)). Run `autokolab db update`");
    expect(aheadLine(13, 12)).toContain("newer than this helper");
  });

  it("shows the status", () => {
    expect(dbStatusLine(12, 12)).toBe("Database: version 12 (up to date)");
    expect(dbStatusLine(11, 12)).toBe("Database: behind: 11 → 12");
    expect(dbStatusLine(13, 12)).toContain("newer than this helper");
  });

  it("never shows the connection string or its password", () => {
    const url = "postgresql://postgres.abc:s3cr3t-pa55@aws-0.pooler.supabase.com:5432/postgres";
    const msg = hideDbUrl(`connect failed for ${url}; password s3cr3t-pa55 rejected`, url);
    expect(msg).not.toContain("s3cr3t-pa55");
    expect(msg).not.toContain(url);
  });

  it("doesn't print the password when it can't connect", async () => {
    const url = "postgresql://nobody:pw-1234-secret@localhost:1/nothing";
    const err = await applySchema(url, 0, []).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/^Couldn't connect to the database/);
    expect((err as Error).message).not.toContain("pw-1234-secret");
  });
});

const hasPg = spawnSync("pg_isready", { stdio: "ignore" }).status === 0;
describe.skipIf(!hasPg)("applying database updates", () => {
  it("applies every pending file in one transaction: all or nothing", async () => {
    const db = `autokolab_dbupdate_${process.pid}`;
    execFileSync("createdb", [db]);
    try {
      const url = `postgresql://localhost/${db}`;
      const good = { version: 1, path: "/x/001_a.sql", sql: "create table a (id int);" };
      const bad = { version: 2, path: "/x/002_b.sql", sql: "create table b (id int); select * from no_such_table;" };
      await expect(applySchema(url, 0, [good, bad])).rejects.toThrow(/002_b\.sql, so nothing was changed/);
      const tables = () => execFileSync("psql", ["-tA", "-d", db, "-c", "select count(*) from pg_tables where tablename in ('a', 'b')"], { encoding: "utf8" }).trim();
      expect(tables()).toBe("0");
      expect(await applySchema(url, 0, [good, { ...bad, sql: "create table b (id int);" }])).toBe(2);
      expect(tables()).toBe("2");
    } finally {
      execFileSync("dropdb", ["--if-exists", db]);
    }
  });

});

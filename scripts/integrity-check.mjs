/**
 * Comprehensive data integrity check for hackathon-submit database.
 * Run with: node --env-file=.env.local scripts/integrity-check.mjs
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const results = [];
function check(name, pass) {
  results.push({ name, pass });
}

(async () => {
  // Fetch all data
  const { data: teams, error: teamsErr } = await supabase.from("teams").select("*");
  if (teamsErr) { console.error("Teams fetch error:", teamsErr.message); process.exit(1); }

  const { data: projects, error: projErr } = await supabase.from("projects").select("*");
  if (projErr) { console.error("Projects fetch error:", projErr.message); process.exit(1); }

  // ===== CHECK 1: Count teams and projects =====
  console.log("========================================");
  console.log("CHECK 1: Count teams and projects");
  console.log("========================================");
  console.log("Teams count:", teams.length, teams.length === 59 ? "PASS" : "FAIL (expected 59)");
  console.log("Projects count:", projects.length, projects.length === 59 ? "PASS" : "FAIL (expected 59)");
  check("Teams count = 59", teams.length === 59);
  check("Projects count = 59", projects.length === 59);

  // ===== CHECK 2: 1:1 team-project mapping =====
  console.log("\n========================================");
  console.log("CHECK 2: Team-Project 1:1 mapping");
  console.log("========================================");

  const teamIds = new Set(teams.map((t) => t.id));
  const projectTeamIds = projects.map((p) => p.team_id);
  const projectTeamIdSet = new Set(projectTeamIds);

  const orphanTeams = teams.filter((t) => !projectTeamIdSet.has(t.id));
  console.log("Orphan teams (no project):", orphanTeams.length === 0 ? "PASS (none)" : `FAIL (${orphanTeams.length})`);
  orphanTeams.forEach((t) => console.log("  - Team id:", t.id, "name:", t.name));
  check("No orphan teams", orphanTeams.length === 0);

  const orphanProjects = projects.filter((p) => !teamIds.has(p.team_id));
  console.log("Orphan projects (invalid team_id):", orphanProjects.length === 0 ? "PASS (none)" : `FAIL (${orphanProjects.length})`);
  orphanProjects.forEach((p) => console.log("  - Project id:", p.id, "team_id:", p.team_id));
  check("No orphan projects", orphanProjects.length === 0);

  const teamIdCounts = {};
  projectTeamIds.forEach((id) => { teamIdCounts[id] = (teamIdCounts[id] || 0) + 1; });
  const duplicateTeamIds = Object.entries(teamIdCounts).filter(([, c]) => c > 1);
  console.log("Duplicate team_ids in projects:", duplicateTeamIds.length === 0 ? "PASS (none)" : "FAIL");
  duplicateTeamIds.forEach(([tid, c]) => console.log("  - team_id:", tid, "count:", c));
  check("No duplicate team_ids in projects", duplicateTeamIds.length === 0);

  // ===== CHECK 3: user_edited and is_submitted flags =====
  console.log("\n========================================");
  console.log("CHECK 3: user_edited=false, is_submitted=false");
  console.log("========================================");

  const editedProjects = projects.filter((p) => p.user_edited !== false);
  console.log("Projects with user_edited != false:", editedProjects.length === 0 ? "PASS (none)" : `FAIL (${editedProjects.length})`);
  editedProjects.slice(0, 10).forEach((p) => {
    const team = teams.find((t) => t.id === p.team_id);
    console.log("  - team:", team?.name ?? p.team_id, "user_edited:", p.user_edited);
  });
  if (editedProjects.length > 10) console.log("  ... and", editedProjects.length - 10, "more");
  check("All user_edited = false", editedProjects.length === 0);

  const submittedProjects = projects.filter((p) => p.is_submitted !== false);
  console.log("Projects with is_submitted != false:", submittedProjects.length === 0 ? "PASS (none)" : `FAIL (${submittedProjects.length})`);
  submittedProjects.slice(0, 10).forEach((p) => {
    const team = teams.find((t) => t.id === p.team_id);
    console.log("  - team:", team?.name ?? p.team_id, "is_submitted:", p.is_submitted);
  });
  if (submittedProjects.length > 10) console.log("  ... and", submittedProjects.length - 10, "more");
  check("All is_submitted = false", submittedProjects.length === 0);

  // ===== CHECK 4: Team fields validation =====
  console.log("\n========================================");
  console.log("CHECK 4: Team fields (name, track, verify_phone)");
  console.log("========================================");

  const emptyNameTeams = teams.filter((t) => !t.name || t.name.trim() === "");
  console.log("Teams with empty name:", emptyNameTeams.length === 0 ? "PASS (none)" : `FAIL (${emptyNameTeams.length})`);
  emptyNameTeams.forEach((t) => console.log("  - Team id:", t.id));
  check("All teams have non-empty name", emptyNameTeams.length === 0);

  const validTracks = ["软件赛道", "硬件赛道"];
  const invalidTrackTeams = teams.filter((t) => !validTracks.includes(t.track));
  console.log("Teams with invalid track:", invalidTrackTeams.length === 0 ? "PASS (none)" : `FAIL (${invalidTrackTeams.length})`);
  invalidTrackTeams.forEach((t) => console.log("  - Team id:", t.id, "name:", t.name, "track:", JSON.stringify(t.track)));
  check("All teams have valid track", invalidTrackTeams.length === 0);

  const emptyPhoneTeams = teams.filter((t) => !t.verify_phone || t.verify_phone.trim() === "");
  console.log("Teams with empty verify_phone:", emptyPhoneTeams.length === 0 ? "PASS (none)" : `FAIL (${emptyPhoneTeams.length})`);
  emptyPhoneTeams.forEach((t) => console.log("  - Team id:", t.id, "name:", t.name));
  check("All teams have non-empty verify_phone", emptyPhoneTeams.length === 0);

  // ===== CHECK 5: Project fields validation =====
  console.log("\n========================================");
  console.log("CHECK 5: Project fields (project_name, one_liner, team_intro, links)");
  console.log("========================================");

  const emptyProjectName = projects.filter((p) => !p.project_name || p.project_name.trim() === "");
  console.log("Projects with empty project_name:", emptyProjectName.length === 0 ? "PASS (none)" : `FAIL (${emptyProjectName.length})`);
  emptyProjectName.slice(0, 10).forEach((p) => {
    const team = teams.find((t) => t.id === p.team_id);
    console.log("  - team:", team?.name ?? p.team_id);
  });
  if (emptyProjectName.length > 10) console.log("  ... and", emptyProjectName.length - 10, "more");
  check("All projects have non-empty project_name", emptyProjectName.length === 0);

  const emptyOneLiner = projects.filter((p) => !p.one_liner || p.one_liner.trim() === "");
  console.log("Projects with empty one_liner:", emptyOneLiner.length === 0 ? "PASS (none)" : `FAIL (${emptyOneLiner.length})`);
  emptyOneLiner.slice(0, 10).forEach((p) => {
    const team = teams.find((t) => t.id === p.team_id);
    console.log("  - team:", team?.name ?? p.team_id);
  });
  if (emptyOneLiner.length > 10) console.log("  ... and", emptyOneLiner.length - 10, "more");
  check("All projects have non-empty one_liner", emptyOneLiner.length === 0);

  const emptyTeamIntro = projects.filter((p) => {
    const ti = p.team_intro;
    return !ti || !Array.isArray(ti) || ti.length === 0;
  });
  console.log("Projects with empty team_intro (0 members):", emptyTeamIntro.length === 0 ? "PASS (none)" : `FAIL (${emptyTeamIntro.length})`);
  emptyTeamIntro.slice(0, 10).forEach((p) => {
    const team = teams.find((t) => t.id === p.team_id);
    console.log("  - team:", team?.name ?? p.team_id, "team_intro:", JSON.stringify(p.team_intro));
  });
  if (emptyTeamIntro.length > 10) console.log("  ... and", emptyTeamIntro.length - 10, "more");
  check("All projects have non-empty team_intro", emptyTeamIntro.length === 0);

  const emptyLinks = projects.filter((p) => {
    const l = p.links;
    return !l || !Array.isArray(l) || l.length === 0;
  });
  console.log("Projects with empty links (0 links):", emptyLinks.length === 0 ? "PASS (none)" : `FAIL (${emptyLinks.length})`);
  emptyLinks.slice(0, 10).forEach((p) => {
    const team = teams.find((t) => t.id === p.team_id);
    console.log("  - team:", team?.name ?? p.team_id, "links:", JSON.stringify(p.links));
  });
  if (emptyLinks.length > 10) console.log("  ... and", emptyLinks.length - 10, "more");
  check("All projects have non-empty links", emptyLinks.length === 0);

  // ===== CHECK 6: Duplicate team names =====
  console.log("\n========================================");
  console.log("CHECK 6: Duplicate team names");
  console.log("========================================");

  const nameCounts = {};
  teams.forEach((t) => { nameCounts[t.name] = (nameCounts[t.name] || 0) + 1; });
  const duplicateNames = Object.entries(nameCounts).filter(([, c]) => c > 1);
  console.log("Duplicate team names:", duplicateNames.length === 0 ? "PASS (none)" : "FAIL");
  duplicateNames.forEach(([name, c]) => console.log("  - Name:", JSON.stringify(name), "count:", c));
  check("No duplicate team names", duplicateNames.length === 0);

  // ===== CHECK 7: team_intro JSON structure =====
  console.log("\n========================================");
  console.log("CHECK 7: team_intro JSON structure ({name, role, bio})");
  console.log("========================================");

  const structureIssues = [];
  projects.forEach((p) => {
    const ti = p.team_intro;
    if (!ti || !Array.isArray(ti) || ti.length === 0) return;
    ti.forEach((member, idx) => {
      const issues = [];
      if (typeof member !== "object" || member === null) {
        issues.push("not an object");
      } else {
        if (!("name" in member)) issues.push("missing name field");
        if (!("role" in member)) issues.push("missing role field");
        if (!("bio" in member)) issues.push("missing bio field");
        if ("name" in member && (typeof member.name !== "string" || member.name.trim() === "")) issues.push("empty name");
        if ("role" in member && (typeof member.role !== "string" || member.role.trim() === "")) issues.push("empty role");
      }
      if (issues.length > 0) {
        const team = teams.find((t) => t.id === p.team_id);
        structureIssues.push({
          team: team?.name ?? p.team_id,
          memberIdx: idx,
          issues: issues.join(", "),
          member: JSON.stringify(member).substring(0, 120),
        });
      }
    });
  });
  console.log("team_intro structure issues:", structureIssues.length === 0 ? "PASS (all valid)" : `FAIL (${structureIssues.length} member entries with issues)`);
  structureIssues.slice(0, 15).forEach((si) =>
    console.log("  - Team:", si.team, `member[${si.memberIdx}]:`, si.issues, "|", si.member)
  );
  if (structureIssues.length > 15) console.log("  ... and", structureIssues.length - 15, "more");
  check("Valid team_intro structure", structureIssues.length === 0);

  // ===== CHECK 8: Links are valid URLs =====
  console.log("\n========================================");
  console.log("CHECK 8: Links are valid URLs (start with http)");
  console.log("========================================");

  const linkIssues = [];
  projects.forEach((p) => {
    const l = p.links;
    if (!l || !Array.isArray(l)) return;
    l.forEach((link, idx) => {
      let url;
      if (typeof link === "string") {
        url = link;
      } else if (typeof link === "object" && link !== null) {
        url = link.url || link.href || link.link || "";
      } else {
        const team = teams.find((t) => t.id === p.team_id);
        linkIssues.push({ team: team?.name ?? p.team_id, idx, issue: "not a string or object", value: JSON.stringify(link) });
        return;
      }
      if (typeof url !== "string" || !url.startsWith("http")) {
        const team = teams.find((t) => t.id === p.team_id);
        linkIssues.push({ team: team?.name ?? p.team_id, idx, issue: "does not start with http", value: JSON.stringify(link).substring(0, 120) });
      }
    });
  });
  console.log("Invalid link URLs:", linkIssues.length === 0 ? "PASS (all valid)" : `FAIL (${linkIssues.length} issues)`);
  linkIssues.slice(0, 15).forEach((li) =>
    console.log("  - Team:", li.team, `link[${li.idx}]:`, li.issue, "|", li.value)
  );
  if (linkIssues.length > 15) console.log("  ... and", linkIssues.length - 15, "more");
  check("All links are valid URLs", linkIssues.length === 0);

  // ===== SUMMARY =====
  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");
  const passed = results.filter((c) => c.pass).length;
  const failed = results.filter((c) => !c.pass).length;
  results.forEach((c) => console.log(c.pass ? "PASS" : "FAIL", "-", c.name));
  console.log(`\nResult: ${passed}/${results.length} passed | ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();

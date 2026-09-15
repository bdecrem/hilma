// Module: Premises Liability: Entrant Status. Drafted by claude-opus-5 on 2026-09-15
// with scripts/socratic/new-module.ts from: no source material (model knowledge).
// The method and tone are the shared Zeiler sections, copied from negligent-entrustment.
//
// Reviewer notes from the draft:
//   **Everything in this module is drawn from memory; no source material was supplied. A subject-matter reviewer should check all of it, and particularly the following.**
//   
//   *Case facts and holdings.* Carter v. Kinney, 896 S.W.2d ___ / 946 S.W.2d 618 (Mo. banc 1997) — I am confident about the core (Bible study in the hosts' home, ice in the driveway, plaintiff held a licensee, summary judgment for defendants affirmed, "invitation does not make an invitee," no material benefit, premises not thrown open to the public). I am less certain about the detail that Mr. Kinney had shoveled the driveway the previous evening and was unaware ice had re-formed; I have relied on it in the doctrine section, Q3, and Q11, so please verify it. The citation should be checked; I have not stated one in the teaching text.
//   
//   *Heins v. Webster County*, 250 Neb. 750, 552 N.W.2d 51 (1996) — check the citation. I am confident the court abolished the licensee/invitee distinction, adopted reasonable care for all lawful visitors, and expressly retained the lesser duty to trespassers, and that the plaintiff fell on ice/snow at a hospital entrance after visiting his daughter, who worked there. The Santa Claus detail and her position as director of nursing are from memory. The seven factors I list are paraphrased, not quoted, and the count and wording should be checked against the opinion. I have also said the case was reversed and remanded only implicitly (Section on doctrine says he "had a jury question"); confirm the disposition.
//   
//   *Restatement citations.* §§ 334–335 (known/constant trespassers), § 339 (child trespassers), and Restatement (Third) §§ 51–52 (reasonable care to all entrants except "flagrant trespassers," plus a duty of reasonable care to an imperiled and helpless flagrant trespasser) are from memory and should be checked, especially the § 52 formulation and whether "flagrant trespasser" is defined in the section or only in comment.
//   
//   *Jurisdictional landscape.* I deliberately avoided numbers. If the reviewer wants counts of states retaining the trichotomy versus merging licensee/invitee versus following Rowland, those should be supplied from a current survey; my recollection is that roughly half retain the full trichotomy, a plurality have merged licensee and invitee, and only a handful follow Rowland in full, but I did not put that in the teaching text because I could not verify it. Note also that California partially retracted Rowland by statute and case law as to some recreational and criminal entrants — not mentioned in the module, but a reviewer may want it added.
//   
//   *The "open and obvious" point.* I present the traditional rule as a no-duty rule and the Restatement (Third) position (§ 51 cmt.) as treating obviousness as relevant but not dispositive where harm should be anticipated. The comment letter is from memory and is not cited in the teaching text; verify before adding one.
//   
//   *Natural accumulation.* I flag in the doctrine section that some jurisdictions have distinct rules for naturally accumulating ice and snow, which is directly relevant to both anchor cases and to the hypothetical. I did not state Missouri's or Nebraska's rule because I am not confident of it. A reviewer may want to add whichever rule applies, since if a strong natural-accumulation defense exists the hypothetical's outcome-determinative framing weakens — the Diaz facts depend on inspection duty being the only thing standing between her and a jury.
//   
//   *The hypothetical.* Invented for this module. The State of Franklin, the prior Franklin decision adopting Heins, Marla Diaz, and the footpath are all fictional; the driveway apron deliberately echoes Carter. The question it poses — whether the logic of licensee/invitee merger requires abandoning the trespasser category — is genuinely open in most merger jurisdictions, but a reviewer should confirm that no controlling authority in the course's home jurisdiction has resolved it, since that would flatten the session. I have also assumed, in saying the § 335 known-trespasser exception probably does not save Diaz, that overnight ice is not an "artificial condition" and that the Kinneys' lack of knowledge defeats the exception independently; both assumptions are contestable and a reviewer may prefer the tutor treat them as arguable rather than as settled.
//   
//   *Terminology.* I use "possessor" throughout and flag the owner/possessor distinction, but I have not covered landlord-tenant premises duties, the firefighter's rule, lessor liability, or liability to persons outside the land. Those are adjacent units and were left out on purpose; if the course sequences them together, the overview in Step 1 may need a sentence situating this module relative to them.

import { negligentEntrustment as zeiler } from './negligent-entrustment'
import type { Module } from '../types'

export const premisesLiability: Module = {
  id: "premises-liability",
  title: "Premises Liability: Entrant Status",
  subtitle: "Carter v. Kinney and Heins v. Webster County, and the shortcut-across-the-yard hypothetical",
  course: "Torts · Duty",
  source: "Modelled on Professor Kathryn Zeiler's Torts class, Boston University School of Law",
  framing: `You are about to run a one-on-one Socratic tutoring session on premises liability — the duty a possessor of land owes to people who come onto it. This sits inside the duty unit, right after the general risk-creation rule and its carve-outs, and it is one of the few places in the first-year course where the *identity of the plaintiff*, rather than the conduct of the defendant, sets the standard of care. The method below is Zeiler's, taken from a real BU Law transcript of her teaching the duty material: commit to a position before you argue, never mistake a list of facts for an argument, argue the other side, draw the line, and only then get told what skill you just used. Your job is not just to convey the categories; it is to make the student reason their way through a question the categories do not answer, and to make the specific corrective moves she makes when an answer falls short.`,
  hypotheticalTitle: "the shortcut across the Kinneys' yard",

  doctrine: `**Where this sits in the outline.** The general rule for physical harm is that one who creates a risk owes a duty of reasonable care under the circumstances. Premises liability is a *carve-down* from that general rule: at common law, a possessor of land owes some entrants **less than** reasonable care, and what he owes turns on the entrant's legal status at the moment of entry — not on how dangerous his land is, not on how careless he was. That inversion is the thing students find strange, and it is the thing to hold onto. Status is a **duty** question. It gets decided before you ever ask whether the defendant behaved badly.

**"Possessor," not "owner."** The duty runs with occupation and control, not with the deed. A tenant, a lessee, a contractor in control of a site can all be possessors; an absentee landlord often is not. Students reflexively say "the owner" — correct it once, in passing.

---

### The common-law trichotomy

**1. Trespasser** — enters or remains without permission or privilege. The possessor owes **no duty to inspect, repair, or warn**; the only duty is to refrain from **willful, wanton, or reckless** injury (no spring guns, no traps). Three familiar softenings:
- *Known or habitual trespassers* on a limited area of the land: Restatement (2d) § 334–335 — a duty to warn of concealed **artificial** conditions the possessor knows about that carry a risk of death or serious bodily harm.
- *Child trespassers / attractive nuisance*: Restatement (2d) § 339 — an artificial condition, in a place the possessor knows children are likely to trespass, that children because of their youth won't appreciate, where the burden of eliminating the risk is slight relative to the danger.
- *Discovered peril*: once the possessor actually knows a trespasser is there and in danger, ordinary care applies to his **active operations**.

**2. Licensee** — enters with the possessor's permission, but for the **licensee's own purposes**. The **social guest is a licensee**. Mark this: it is the single most counterintuitive rule in the unit, and students resist it because the guest was, in plain English, invited. Duty: warn of, or make safe, **dangers the possessor actually knows about** that the licensee is unlikely to discover — plus reasonable care in active operations. Crucially, **no duty to inspect**. The possessor takes the land as he keeps it; the guest takes it as he finds it.

**3. Invitee** — two branches:
- *Business visitor*: enters for a purpose connected with the possessor's business dealings, i.e. the possessor stands to gain a **material benefit**.
- *Public invitee*: enters land **held open to the public** for the purpose for which he entered — a park, a church sanctuary during services, a public library.
Duty: **reasonable care**, which includes an affirmative **duty to inspect** for dangers the possessor does not yet know about, and then to repair, warn, or otherwise protect.

**The operative difference between licensee and invitee is the duty to inspect.** Everything else is decoration. If the possessor didn't know about the hazard, the licensee loses and the invitee may still win. Make sure the student can say that sentence.

**Status is fixed at entry but can change.** Exceed the scope of the invitation — the customer who wanders through the "Employees Only" door — and an invitee becomes a licensee or a trespasser. Status is also *area-specific* and *purpose-specific*.

---

### Carter v. Kinney (Mo. 1997) — the anchor case for the categories

The Kinneys hosted an early-morning Bible study in their home as part of a program organized by their church. Carter, a fellow church member, drove over, and on arriving slipped on a patch of ice in the Kinneys' driveway and broke his leg. Mr. Kinney had shoveled the driveway the night before and did not know that ice had formed overnight.

Held: Carter was a **licensee**, not an invitee, and because the Kinneys had no knowledge of the ice, they breached no duty. Summary judgment for the Kinneys affirmed.

The reasoning is what matters:
- **An invitation does not make an invitee.** The word is a false friend. Hospitality is not the test.
- The Kinneys got no **material benefit** — spiritual or social benefit to the host, or benefit to the *church*, is not the kind of benefit the business-visitor branch means.
- The Kinneys did not **throw open their premises to the public**. They invited a specific set of people into a private home for a private gathering. A public invitation is about holding land open, not about the size of the guest list.

Students go wrong here in two predictable ways: (i) "but he was *invited*" — the invitation fallacy; (ii) "the church benefited, and the Kinneys benefited spiritually, so there was a material benefit" — which collapses the business-visitor branch into any reason at all for wanting the visitor to come.

---

### Heins v. Webster County (Neb. 1996) — the anchor case for the collapse

Heins went to the county hospital where his daughter worked as director of nursing. The visit was at least partly social — he also claimed he was there to discuss playing Santa Claus for the staff at Christmas. On the way out, he fell on snow and ice at the main entrance. If he was a licensee, the traditional rule sank him; if an invitee, he had a jury question.

Rather than decide which box he was in, the Nebraska Supreme Court **abolished the distinction between licensees and invitees** and adopted a single standard of **reasonable care in the maintenance of the premises for all lawful visitors**. It expressly **retained a separate, lesser duty to trespassers**. The court listed factors relevant to reasonableness, including: the foreseeability or possibility of harm; the purpose for which the entrant entered; the time, manner and circumstances of entry; the use to which the premises are put or are expected to be put; the reasonableness of inspection, repair, or warning; the opportunity and ease of repair or of giving warning; and the burden on the possessor or the community of providing protection.

Key points the student must get:
- Heins does **not** make possessors insurers, and it does **not** abolish the status inquiry entirely. Status migrates from being the **rule of law that sets the standard** to being a **fact that bears on foreseeability and reasonableness** — i.e., it moves from duty into breach, where a jury handles it.
- Heins keeps the trespasser line. It offers a reason (no obligation to make land safe for people with no right to be there) but not an especially deep one. **That unfinished business is the session's hypothetical.**

**The broader landscape.** *Rowland v. Christian* (Cal. 1968) went further and abolished all three categories in favor of ordinary negligence. A substantial number of states have merged licensee and invitee while keeping trespassers out, as Heins did; a substantial number retain the full trichotomy. The Restatement (Third) of Torts: Liability for Physical and Emotional Harm §§ 51–52 adopts a duty of reasonable care to all entrants **except "flagrant trespassers,"** to whom only a duty not to act in an intentional, willful, or wanton manner is owed (plus a duty of reasonable care to a flagrant trespasser who is imperiled and helpless). Note the doctrinal move there: "flagrant" tries to do with a standard what the old rule did with a category.

---

### Places students reliably go wrong (watch for these)

- **Invitation ≠ invitee.** See above. Re-probe from a different angle if it appears.
- **Conflating status with knowledge of the hazard.** "The Kinneys had no duty because they didn't know about the ice" is wrong twice over: the absence of knowledge goes to **breach** under the licensee standard, and it is irrelevant to **duty**, which was fixed the moment Carter stepped onto the driveway as a licensee.
- **Treating "open and obvious" as an automatic no-duty rule.** Traditionally it was framed that way; the Restatement (Third) § 51 treats obviousness as relevant to reasonableness, not as a categorical bar, especially where the possessor should anticipate harm despite the obviousness. Don't let a student use it as a trump card.
- **Confusing the two branches of invitee.** A person can be a public invitee without any commercial transaction at all.
- **Thinking abolition changes the rest of the prima facie case.** Under Heins the plaintiff still must prove breach, cause in fact, proximate cause, and damages, and still faces comparative fault. Abolition changes the standard of care, not the burden of proof.
- **Natural accumulation.** Some jurisdictions have separate rules for naturally accumulating snow and ice. Flag it if it comes up, but do not let it hijack the status analysis.`,

  hypothetical: `The categories are settled for the people inside them. What no court has settled — and what Heins deliberately left open — is whether the trespasser line survives once the licensee/invitee line is gone. That is the session.

**The setup.** The State of Franklin's supreme court decided a case last term adopting the Heins rule: reasonable care to all **lawful** entrants, licensee and invitee merged. The opinion's last paragraph says: "We leave for another day the question whether the traditional rule governing trespassers should likewise be reconsidered." That day has arrived.

**The facts.** The Kinneys' house sits on a corner lot between a residential street and the bus stop on the main road. Over six years, a visible dirt path has been worn across the corner of their lawn and down the edge of their driveway apron; a dozen or so neighbors use it every morning to cut about four minutes off the walk to the bus. The Kinneys have seen people on the path many times. They have never invited anyone to use it, never objected, never posted a sign, never put up a fence.

Marla Diaz, a home health aide, takes the path every weekday at 5:50 a.m. on her way to a 6:30 shift. On an icy January morning she slips on the driveway apron — the same apron where Carter fell — and shatters her hip. The Kinneys had shoveled the evening before and did not know that ice had re-formed overnight.

**Why status decides the case.** Notice the facts are built so the label is outcome-determinative:
- **Trespasser (traditional rule):** no duty to inspect, repair, or warn. Nothing here is willful or wanton. Diaz loses on summary judgment. Even the known-trespasser softening probably doesn't save her: overnight ice is not obviously an "artificial condition," and in any event the Kinneys did not know it was there.
- **Licensee (traditional rule):** duty only as to **known** dangers. Diaz still loses — this is exactly Carter.
- **Lawful entrant under the Franklin/Heins rule:** reasonable care **including inspection**. Whether a reasonable homeowner who knows people walk that apron at dawn in January should have salted it becomes a jury question, and Diaz survives summary judgment.

**The question you will argue all session:**

> **Should Franklin extend the reasonable-care standard to Marla Diaz — that is, does the logic that killed the licensee/invitee distinction also require abolishing the trespasser category? If not, what principled line separates Diaz from the Bible-study guest?**

Existing doctrine does not answer this. Heins says trespassers stay out and gives a one-sentence reason. Rowland says they come in. The Restatement (Third) says neither, exactly — it lets in all trespassers except "flagrant" ones, which invites the question of what makes a trespass flagrant and whether Diaz's daily four-minute shortcut qualifies. The student has to pick a side and defend it.

**One dodge to watch for.** Many students will try to argue that six years of silent acquiescence makes Diaz an implied **licensee**, not a trespasser. That is a real doctrinal move and worth naming — but it is also precisely how courts avoid the hard question. Credit it, then close it off: assume Franklin law treats her as a trespasser, and make the student argue the question actually on the table.`,

  method: zeiler.method,

  protocol: `**Step 1 — Overview.** Give the student a tight, organized overview: where premises liability sits as a carve-down from the general risk-creation duty; "possessor," not owner; the three categories with their definitions and their duties, with the emphasis on the fact that the **duty to inspect** is what actually separates licensee from invitee; Carter v. Kinney (invitation ≠ invitee; no material benefit; premises not thrown open to the public; no knowledge of the ice, so no breach); Heins v. Webster County (licensee/invitee merged into reasonable care for all lawful visitors, trespasser category retained, status demoted to a foreseeability factor); and one sentence each on Rowland and Restatement (Third) §§ 51–52. A few paragraphs, not an essay. End by laying out the hypothetical in Section 3 as the question the student will have to argue.

**Step 2 — Readiness check.** Ask explicitly: *"Ready for me to start asking you questions on this?"* Do not proceed until the student says yes. If they want more of the overview first, give it.

**Step 3 — Socratic questioning, with branching.** Work through the question bank in Section 5. For every answer:
- Bare conclusion with no support → move **(a)**: make them commit to a side, then demand the argument.
- A recitation of facts ("she used the path for six years, they saw her, they never objected, they knew it was icy season…") → move **(b)**, in close to her actual phrasing: *that's a list of facts, not an argument — tell me how those facts get me to your conclusion.* Do not advance until the facts are connected to the conclusion by reasoning. This will happen most often on Q5 and Q6; expect it and enforce it every time.
- Genuinely stuck after a real attempt → move **(c)**, one strategy at a time, never all three at once: (1) the **policy behind the rule** — what is the status hierarchy actually for? Historically, the primacy of land ownership and the idea that you shouldn't have to make your land safe for people who have no right to be on it. Does that purpose still hold for a neighbor on a worn footpath? (2) **Analogize to precedent** — Heins refused to let a label decide a case when the hazard, the foreseeability, and the cost of salting were identical whichever label applied. Diaz's case is "no different": the ice doesn't know who's standing on it. (3) **Consequentialist, both directions** — extending the duty reduces preventable injury; refusing to extend it means a known, cheap-to-fix hazard on a path the possessor watched people use for six years produces a shattered hip and no remedy. Make the student sit with that.
- A good argument on one side → move **(d)**: flip it. "Now argue the opposite."
- Arguing for extension → moves **(e)** and **(f)**: where does it stop, and who gets hurt if we go too far.
- Straying into another element — most often saying the Kinneys "had no duty because they didn't know about the ice," which is breach, or "but for the ice she wouldn't have fallen," which is causation → move **(h)**: name the element they actually just argued, say where it belongs, and do not credit it as a duty argument.
- Trying the acquiescence dodge (Diaz is really a licensee) → credit the move, name it as the classic judicial evasion, then close it off and require the trespasser question.
- Whenever a full arc completes (position → argument → counter-argument → line-drawing) → move **(g)**: name the skill out loud, *after* the work, then move **(i)**: recap where this sits — duty → breach → causation → harm, and inside duty: general rule → premises carve-down → categories → merger.

If the student is simply wrong on the doctrine — says Carter came out the other way, says a social guest is an invitee, says Heins abolished all three categories, or says the licensee duty includes inspection — **teach**: short, direct correction restating the rule, confirm they have it, then **re-probe the same point from a different angle with a new question**, not the same one. Never move on with a doctrinal misunderstanding still standing.

**Step 4 — Mastery check and wrap-up.** Once the student has (1) stated the Carter and Heins holdings correctly, (2) described the structure of a premises analysis correctly, (3) argued both sides of the Diaz hypothetical without lapsing into a list of facts, and (4) engaged the line-drawing and sympathetic-group challenge — summarize what they demonstrated and name what still looks shaky. Then offer a transfer variant so they can prove the skill moves: a child who slips into an unfenced backyard koi pond (does attractive nuisance survive merger, and why did we ever need it?); a delivery driver who takes a shortcut across a neighboring lot; or a homeless man sleeping in the stairwell of a vacant commercial building — the case that makes the "flagrant trespasser" standard bite.`,

  questionBank: `1. **Doctrine check:** "Name the three common-law categories of entrant and the duty owed to each."
   *Model answer:* **Trespasser** — no permission or privilege; duty only to refrain from willful, wanton, or reckless injury, with softenings for known/habitual trespassers, child trespassers under § 339, and discovered peril. **Licensee** — permission, but present for his own purposes (the social guest); duty to warn of or make safe **known** concealed dangers and to use care in active operations; **no duty to inspect**. **Invitee** — business visitor (material benefit to possessor) or public invitee (land held open to the public for the purpose of entry); duty of **reasonable care, including inspection** for unknown hazards.

2. **Doctrine check, aimed at the classic error:** "Carter was invited to the Kinneys' home by name. Why wasn't he an invitee?"
   *Model answer:* Because "invitee" is a term of art and the invitation is not the test. Invitee status requires either a **material benefit** to the possessor from the visit or premises **held open to the public**. The Kinneys got neither a business benefit nor public-invitee status by hosting a private Bible study in a private home; spiritual or social benefit, and benefit flowing to the church rather than the hosts, does not count. He was a licensee — a social guest.
   *Watch for:* "the church benefited" or "they benefited spiritually." Correct it; that reading collapses the material-benefit branch into any motive for wanting a guest.

3. **Case result:** "The Kinneys won. On which element, and why does that matter for how we think about the categories?"
   *Model answer:* They won on **breach**, not duty. Carter was a licensee, so the duty was to warn of dangers they knew about; they had shoveled the night before and did not know the ice had re-formed, so no breach. It matters because it shows exactly what the licensee/invitee line does work on: had he been an invitee, the duty to **inspect** would have made the Kinneys' ignorance of the ice a jury question rather than a winning defense.

4. **Doctrine check:** "What did Heins hold, and what survived it?"
   *Model answer:* Nebraska abolished the licensee/invitee distinction and imposed a duty of reasonable care on possessors toward **all lawful visitors**, listing factors — foreseeability, purpose of entry, circumstances of entry, expected use of the premises, reasonableness and ease of inspection/repair/warning, and burden on the possessor and community. What survived: the **trespasser** category and its lesser duty; and status itself, demoted from a rule of law fixing the standard of care to a **fact bearing on foreseeability and reasonableness** — it moves from duty to breach.

5. **The hypothetical, position-forcing:** "Franklin has adopted Heins. Marla Diaz falls on the Kinneys' driveway apron on a path she's used for six years. Should the reasonable-care standard reach her? Take a position."
   *Do not accept:* "It depends" without a follow-up commitment; a bare yes or no with no reasoning to come; or the pivot to "she's really a licensee by acquiescence." Credit that last one as a genuine doctrinal move, name it as the standard judicial evasion, then close it off — assume Franklin calls her a trespasser and make them argue the question on the table.

6. **Argument-building (abolition side):** "Make the argument that the trespasser category should fall too." — enforce **(b)** relentlessly here; this is where the fact-list appears.
   *Model elements:* The **same reasoning** that killed the licensee/invitee line applies unchanged — Heins objected to a plaintiff's recovery turning on a label that has nothing to do with the hazard, the foreseeability of the injury, or the cost of preventing it, and Diaz's case has the identical structure. The **purpose** of the trespasser rule was the primacy of land ownership in an agrarian property regime; it does not explain why a homeowner who watched a footpath form over six years should owe nothing to the people on it. The categories **survive in substance anyway**: purpose of entry and expectations of use are Heins factors, so a burglar in a basement at 3 a.m. and a neighbor on a visible path at dawn will still be treated differently — by a jury, on the facts, rather than by a label at summary judgment. And **administrability**: the exceptions (known trespassers, attractive nuisance, discovered peril, licensee-by-acquiescence) have already eaten so much of the rule that the rule mostly generates litigation about which exception applies.

7. **Flip:** "Now argue the other side — Franklin should keep the trespasser rule."
   *Model elements:* A **right to be there** is a real moral line, not an arbitrary one; the possessor's obligation should be owed to people whose presence he has some say over. Abolition imposes an **inspection duty running to unknown persons at unknown places and times** — the Kinneys would have to salt an apron at 5:30 a.m. for people they never asked to come. It shifts the cost of a hazard onto the party who did not choose the encounter, and does it **regressively**: the elderly homeowner on a fixed income with a big lot bears more of it than the commercial defendant who was already an invitee-magnet. It **rewards the entrant who took the risk knowingly** — Diaz chose the shortcut in January. And a jury-factor regime is a real cost: no summary judgment, settlement pressure in every case, and a rule the homeowner cannot look up in advance.

8. **Line-drawing:** "You want to extend the duty to Diaz. Where does it stop? Does the burglar get reasonable care?"
   *Good answer:* Proposes a limiting principle and defends it. Candidates: the Restatement (Third)'s **flagrant trespasser** carve-out; a **foreseeability limit** (duty runs only to entrants whose presence the possessor knew or should have known of — which is really the § 334 known-trespasser rule swallowing the general rule); a **wrongful-purpose limit** (no duty to one whose entry is itself criminal); or an **express-exclusion limit** (fence it, post it, and the duty drops back to willful/wanton). Then push: is "flagrant" any more determinate than "invitee"? Have we traded one label for another, just moved to the jury? A strong student sees that objection coming and answers it.

9. **Sympathetic group, both directions:** "Who gets hurt if we abolish the trespasser category? And who gets hurt if we keep it?"
   *Model answer, keep it:* children cutting through lots, people taking the only walkable route in a place built for cars, the homeless sheltering in a stairwell, a person fleeing a threat, a delivery driver off the marked path, a neighbor on a worn footpath — people whose injuries are cheap to prevent and who have no remedy because of a label.
   *Model answer, abolish it:* homeowners of modest means with large or wooded lots; farmers with ponds, equipment, and barns; small landlords; anyone who cannot afford to inspect and insure against strangers. Push them past "bad consequences" to actual people.

10. **Structure check:** "Walk me through how you analyze a premises case from the top — traditional rule first, then under Heins."
    *Model answer:* **Traditional:** (1) identify the **possessor** — who had occupation and control; (2) fix the plaintiff's **status at entry**, and check whether it changed by scope or area; (3) that status supplies the **standard of care** — willful/wanton, warn-of-known-dangers, or reasonable care including inspection; (4) **breach** measured against that standard; (5) **cause in fact and proximate cause**; (6) **damages**; then defenses, comparative fault, open-and-obvious. **Under Heins:** step (2) no longer sets the standard for lawful entrants — reasonable care does — and status re-enters at step (4) as evidence of foreseeability and expected use. The trespasser determination still operates at step (3) as a duty question, which is exactly why the Diaz case is decided before a jury ever sees it.

11. **Application:** "Same jurisdiction, same ice. Run Carter himself through the Franklin rule. Does he still lose?"
    *Model answer:* No longer on the pleadings. As a lawful visitor he gets reasonable care, which includes a duty to inspect, so the Kinneys' ignorance of the re-formed ice stops being dispositive and becomes a jury question: was it reasonable, having shoveled at night in January and invited people to arrive before dawn, not to check or salt the driveway in the morning? He may still lose — the burden of the precaution and comparative fault are live — but the label no longer ends the case. A strong student notices that this is the whole point of Heins: the distinction it abolished was doing outcome-determinative work at summary judgment on a ground unrelated to the risk.

12. **Boundary-check trap:** "Simple — the Kinneys had no duty to Diaz because they didn't know the ice was there. Right?"
    *Correct redirect:* No — that's a **breach** argument wearing duty's clothes. Duty is fixed by status at entry and doesn't depend on what the possessor knew about any particular hazard. Knowledge of the condition matters only *after* you know the standard, and only because the licensee standard happens to be defined in terms of known dangers. Name the conflation, say where it belongs in the prima facie case, and don't credit it as a duty answer. (The same move applies to "but for the ice, she wouldn't have fallen" — that's cause in fact.)`,

  tone: zeiler.tone,

  masteryCriteria: {
    holding: "States the Carter v. Kinney holding correctly (social guest is a licensee; an invitation does not create invitee status absent material benefit or premises held open to the public; the Kinneys prevailed on breach because they did not know of the ice) and the Heins holding correctly (licensee/invitee merged into reasonable care for all lawful visitors, trespasser category retained)",
    structure: "Describes the structure of a premises analysis correctly — identify the possessor, fix the entrant's status at entry, derive the standard of care from that status, then breach, causation, and harm — and explains how Heins relocates status from duty to the breach/foreseeability inquiry for lawful entrants",
    both_sides: "Argues both sides of the Diaz hypothetical — abolishing and retaining the trespasser category — with reasoning that connects the facts to the conclusion, rather than reciting the path, the six years, and the Kinneys' silence as if the facts argued themselves",
    line_drawing: "Engages the line-drawing challenge (where a duty to trespassers stops, and whether 'flagrant trespasser' is any more determinate than the labels it replaces) and identifies sympathetic groups harmed by extending the duty and by refusing to extend it",
  },

  transcript: '',
}

// Privacy Policy — public page (/privacy). Also the destination of the homepage
// "FERPA-aligned" trust badge, so it explains the privacy posture honestly, and
// it doubles as KYRO's PUBLIC DATA-PRACTICES DISCLOSURE (Illinois SOPPA requires
// one; this page is it). Claims here are checked against the code they describe
// — under FTC Act §5 the highest-stakes privacy bug is a doc that overclaims.
import LegalPage, { H2, P, UL } from './LegalPage.jsx'

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 26, 2026">
      <P>
        This Privacy Policy explains how KYRO (&ldquo;KYRO,&rdquo; &ldquo;we&rdquo;) collects, uses, and protects
        information in connection with the KYRO platform (the &ldquo;Service&rdquo;). KYRO provides the Service to
        schools and organizations (&ldquo;Customers&rdquo;); when we process Customer data, we do so on the
        Customer&rsquo;s behalf and under its direction. This page also serves as KYRO&rsquo;s public data-practices
        disclosure under state student-privacy laws such as the Illinois Student Online Personal Protection Act.
      </P>

      <H2>1. Information we process</H2>
      <UL>
        <li><strong>Account information</strong> — names, work email, and role of the users a Customer invites.</li>
        <li>
          <strong>Customer Data</strong> — the school&rsquo;s financial and operational data (trial balances,
          statements, budgets, enrollment figures, assessment aggregates) and any documents a Customer uploads.
        </li>
        <li>
          <strong>Student roster data (optional)</strong> — schools that use the enrollment module may load a
          deliberately data-minimal student register: name, grade, coarse demographics as the school records them,
          date of birth, enrollment status and dates, three coarse support flags (IEP&nbsp;/&nbsp;504&nbsp;/&nbsp;ELL),
          and an optional SIS identifier. KYRO stores <strong>no</strong> Social Security numbers, no addresses, no
          family contact information, and no medical or disciplinary records.
        </li>
        <li><strong>Usage &amp; security logs</strong> — sign-ins, actions, and audit events used to secure the Service.</li>
      </UL>
      <P>
        Student identity is readable through exactly <strong>one door</strong>: the register&rsquo;s own screens,
        behind the school-scoped, role-gated sign-in. Which of its own staff roles may open that door is the
        school&rsquo;s configured decision, which KYRO enforces and logs. Every other surface — dashboards, analytics,
        network roll-ups, briefings, the AI assistant — receives <strong>counts only, never a name</strong>, and any
        count small enough to identify a student (fewer than five) is withheld before it leaves our servers, with
        companion cells withheld where subtraction could rebuild it — including headline figures and filtered
        totals that restate a withheld cell. What can still be inferred is only the combined size of a withheld
        group of cells, never an individual cell — the standard behavior of complementary suppression. This
        follows the U.S. Department of Education&rsquo;s PTAC disclosure-avoidance guidance.
      </P>

      <H2>2. How we use information</H2>
      <P>
        We use information solely to provide, secure, support, and improve the Service for the Customer. We do
        <strong> not</strong> sell personal information, do <strong>not</strong> use Customer Data for targeted
        advertising or for profiling students for any non-educational purpose, and do <strong>not</strong> use
        Customer Data to train AI models.
      </P>

      <H2>3. Student privacy laws — our posture, stated plainly</H2>
      <P>
        <strong>FERPA.</strong> FERPA directly binds schools that receive U.S. Department of Education program funds;
        most private and faith-based schools do not, and are not directly subject to it. KYRO&rsquo;s commitment is
        therefore <strong>FERPA-equivalent by contract</strong>: whether or not FERPA formally applies, KYRO behaves
        as a FERPA &ldquo;school official&rdquo; would have to — the school owns and controls its records, KYRO uses
        them only to provide the contracted Service, and KYRO does not re-disclose them. For customers that do hold
        direct federal grants, or for public and publicly funded programs, KYRO offers a data-protection addendum
        aligned with state student-data contract laws. KYRO describes itself as <strong>FERPA-aligned</strong>; there
        is no such thing as government FERPA certification, and we do not claim one.
      </P>
      <P>
        <strong>COPPA.</strong> COPPA does not apply to KYRO because no personal information is collected online from
        children; students do not use the Service. Its users are school staff, and student data arrives from the
        school itself. As an internal product rule, no student-facing feature ships without a full review of the
        amended COPPA Rule first.
      </P>
      <P>
        <strong>State student-privacy laws</strong> such as California&rsquo;s SOPIPA (as amended by AB&nbsp;801),
        Illinois&rsquo; SOPPA (which covers private and nonpublic schools), and Washington&rsquo;s student-privacy
        statute bind operators like KYRO directly, and we treat their combined duties as our national floor: no
        targeted advertising, no profiling, no sale of student data; disclosure only for enumerated service purposes;
        reasonable security; deletion on school request — including parent- or guardian-initiated deletion routed
        through the school; breach notice to affected schools <strong>within 30 days</strong>; and this public
        disclosure of our data practices.
      </P>

      <H2>4. How we protect information</H2>
      <UL>
        <li><strong>Encryption in transit</strong> — TLS end-to-end, from the browser through every internal hop to the database.</li>
        <li><strong>Encryption at rest</strong> — databases, document storage, and secrets are encrypted with managed keys.</li>
        <li><strong>Tenant isolation</strong> — every request is scoped to the Customer; cross-tenant access is denied.</li>
        <li><strong>Least-privilege access &amp; audit logging</strong> — administrative and application access is separated and logged; roster audit entries record counts, never names.</li>
        <li><strong>Private network &amp; firewall</strong> — the application runs in a private network behind a web application firewall; the database is not internet-accessible.</li>
        <li><strong>Small-cell suppression</strong> — aggregate figures covering fewer than five students are withheld server-side everywhere outside the register itself.</li>
      </UL>

      <H2>5. Artificial intelligence</H2>
      <P>
        In production, the Penny assistant and AI insights run by default on models hosted{' '}
        <strong>within KYRO&rsquo;s own cloud account</strong> (Amazon Bedrock): prompts are processed in-account and
        are not used for model training. The Service also supports external model routing (OpenRouter to Anthropic
        Claude, or the Anthropic API); when those paths are used, every request carries{' '}
        <strong>zero-data-retention instructions</strong> so it is served only by endpoints that neither store nor
        train on prompts, and account-level no-retention and no-training settings are maintained with those providers.
      </P>
      <P>
        Independently of the model path, a redaction layer replaces known personal identifiers with placeholder tokens
        before content reaches any model and restores them only for the authenticated user; emails and SSN-shaped text
        typed into chat are masked before leaving our systems. Uploaded PDFs and images are never sent to a model;
        spreadsheets are reduced to small, redacted digests. The assistant reads student data as{' '}
        <strong>counts only</strong> — it has no access to the student register&rsquo;s rows. One honest limit: a name
        a user types free-form into chat is not a registered identifier and cannot be reliably detected; the assistant
        is instructed never to repeat such names into records or answers. Conversations are{' '}
        <strong>not stored on our servers</strong>.
      </P>

      <H2>6. Data retention &amp; deletion</H2>
      <P>
        We retain Customer Data for as long as the Customer uses the Service. Assistant conversations are never stored
        server-side; audit-log retention is configurable by deployment. A Customer may request export or deletion of
        its data at any time; deletion — including hard deletion of individual student records, and parent- or
        guardian-initiated deletion routed through the school — removes the associated records and purges related
        documents from storage, recorded in the audit log.
      </P>

      <H2>7. Service providers (sub-processors) — and what each receives</H2>
      <P>
        We host the Service on <strong>Amazon Web Services (AWS)</strong> in the United States. The full list of
        sub-processors, with what each one actually receives, is below. Each is bound to protect the information and
        to use it only to perform its service for us, and each is subject to the same restrictions we accept: no sale
        of Customer Data, and no use of it to train AI models. We will give notice before adding a sub-processor that
        processes Customer Data.
      </P>
      <UL>
        <li>
          <strong>Amazon Web Services</strong> (United States) &mdash; hosting, database, document storage, encryption
          keys, in-account AI models and voice. Processes all categories of Customer Data, encrypted in transit and at
          rest, inside KYRO&rsquo;s own account.
        </li>
        <li>
          <strong>Anthropic</strong> (United States) &mdash; the language model behind Penny and written insights when
          the external path is used. Receives redacted, tokenized prompts and aggregate figures only — no documents,
          no student register rows. Anthropic does not train on data submitted through its API.
        </li>
        <li>
          <strong>OpenRouter</strong> (United States) &mdash; routes external model requests to the provider above.
          Receives the same redacted content; every request carries zero-data-retention instructions, and account-level
          no-retention enforcement is maintained.
        </li>
        <li>
          <strong>ElevenLabs</strong> (United States) &mdash; optional spoken narration, only when a user plays audio
          on a deployment configured for it. Receives spoken text that is scrubbed before sending (emails and
          SSN-shaped text masked, internal tokens stripped); the account-level training opt-out is maintained. Text a
          user explicitly asks to have spoken aloud does reach this provider in scrubbed form.
        </li>
        <li>
          <strong>Intuit (QuickBooks)</strong> (United States) &mdash; accounting sync, at the school&rsquo;s election
          and only for schools that connect it. KYRO reads from QuickBooks; <strong>nothing is sent to Intuit</strong>,
          and no student data is involved in either direction.
        </li>
        <li>
          <strong>Stripe</strong> (United States) &mdash; subscription billing. Billing contact and payment details
          only; no school operational or student data.
        </li>
        <li>
          <strong>Brevo</strong> (European Union) &mdash; transactional email such as invitations, alerts and scheduled
          reports. Recipient addresses and aggregate notification text only; no student-level data.
        </li>
      </UL>

      <H2>8. Getting your data, and leaving</H2>
      <P>
        Your school owns its data. An owner can export a complete copy at any time from Settings &rarr; Your Data
        &mdash; every module, as spreadsheets, with no request to us and no involvement from us. The archive excludes
        connection credentials such as QuickBooks or SIS tokens, which are keys to other systems rather than
        information about your school, together with a small number of records that describe our billing and export
        machinery rather than your school. Everything left out is named in the archive&rsquo;s own README, with the
        reason. Because a full export is a complete copy leaving the platform, every other owner
        at the school is notified when one is requested, and both the request and the download are recorded in the
        audit log.
      </P>
      <P>
        On termination, Customer Data remains available for export for <strong>thirty days</strong>. After that period,
        or earlier on written request, we delete it from production systems, and it ages out of encrypted backups
        within the backup retention window. We will confirm deletion in writing on request. If we ever cease operating,
        the export above is deliberately built so that retrieving your data does not depend on us being available to
        help.
      </P>

      <H2>9. Your choices &amp; requests</H2>
      <P>
        Parents and eligible students should direct access, review, amendment, and deletion requests to their school,
        which controls the records; KYRO will assist the school in responding, and honors school-routed deletion
        requests including those a parent or guardian initiates. Customer administrators can manage users and request
        data export or deletion at any time.
      </P>

      <H2>10. Changes</H2>
      <P>
        We may update this Policy; material changes will be communicated through the Service or by email. Continued use
        after the effective date constitutes acceptance.
      </P>

      <H2>11. Contact</H2>
      <P>
        Privacy questions, data requests, or a copy of our Student Data Privacy &amp; Compliance Overview:{' '}
        <a className="font-semibold text-gold underline" href="mailto:support@ourkyro.com">support@ourkyro.com</a>.
      </P>

      <P>
        <em className="text-muted">
          This page describes KYRO&rsquo;s actual practices and does not constitute legal advice. KYRO recommends
          review by qualified counsel before relying on it.
        </em>
      </P>
    </LegalPage>
  )
}

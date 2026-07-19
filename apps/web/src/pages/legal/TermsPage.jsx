// Terms of Service — public page (/terms).
import LegalPage, { H2, P, UL } from './LegalPage.jsx'

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="July 19, 2026">
      <P>
        These Terms of Service (&ldquo;Terms&rdquo;) govern access to and use of the KYRO platform and related
        services (the &ldquo;Service&rdquo;) provided by KYRO (&ldquo;KYRO,&rdquo; &ldquo;we,&rdquo; or &ldquo;us&rdquo;).
        By creating an account or using the Service, the school or organization you represent (&ldquo;Customer,&rdquo;
        &ldquo;you&rdquo;) agrees to these Terms. If you do not agree, do not use the Service.
      </P>

      <H2>1. The Service</H2>
      <P>
        KYRO provides a financial and operational intelligence platform for schools, including financial reporting,
        analytics, benchmarking, enrollment intelligence, and the Penny AI assistant. Features may be added, changed,
        or removed over time. Access to certain modules may require a paid subscription.
      </P>

      <H2>2. Accounts &amp; eligibility</H2>
      <P>
        You are responsible for maintaining the confidentiality of account credentials and for all activity under
        your accounts. You must provide accurate information, promptly deactivate users who should no longer have
        access, and notify us of any unauthorized use. You represent that you are authorized to bind your school or
        organization to these Terms.
      </P>

      <H2>3. Customer data &amp; ownership</H2>
      <P>
        As between the parties, you own all data you submit to the Service (&ldquo;Customer Data&rdquo;). You grant
        KYRO a limited license to host, process, and display Customer Data solely to provide and support the Service.
        We do not sell Customer Data, and we do not use it to train third-party AI models.
      </P>
      <P>
        Where Customer Data includes student education records, KYRO acts as a &ldquo;school official&rdquo; with a
        legitimate educational interest under FERPA, under your direction and control, and uses such records only to
        provide the Service. See our <a className="font-semibold text-gold underline" href="/privacy">Privacy Policy</a>{' '}
        and FERPA Compliance Overview for detail.
      </P>

      <H2>4. Acceptable use</H2>
      <P>You agree not to:</P>
      <UL>
        <li>Use the Service in violation of law or any third party&rsquo;s rights;</li>
        <li>Upload records you are not authorized to disclose to a service provider;</li>
        <li>Attempt to access another customer&rsquo;s data, or probe, scan, or breach security;</li>
        <li>Reverse engineer, resell, or provide the Service to unauthorized third parties; or</li>
        <li>Interfere with the integrity or performance of the Service.</li>
      </UL>

      <H2>5. Fees &amp; subscriptions</H2>
      <P>
        Paid plans are billed per the pricing presented at purchase. Unless stated otherwise, fees are non-refundable,
        subscriptions renew for successive terms, and you may cancel renewal before the end of the current term. We may
        change pricing on renewal with notice.
      </P>

      <H2>6. Intellectual property</H2>
      <P>
        The Service, including all software, models, designs, and content (excluding Customer Data), is owned by KYRO
        and its licensors and is protected by copyright and other laws. No rights are granted except as expressly set
        out in these Terms. &ldquo;KYRO&rdquo; and related marks are trademarks of KYRO.
      </P>

      <H2>7. Confidentiality</H2>
      <P>
        Each party will protect the other&rsquo;s confidential information with reasonable care and use it only to
        perform under these Terms. Customer Data is your confidential information and is protected by the safeguards
        described in our Privacy Policy.
      </P>

      <H2>8. Warranties &amp; disclaimers</H2>
      <P>
        We will provide the Service with reasonable skill and care. Except as expressly stated, the Service is provided
        &ldquo;as is&rdquo; without warranties of any kind, whether express or implied, including merchantability,
        fitness for a particular purpose, and non-infringement. KYRO&rsquo;s outputs (including AI-generated content and
        analytics) are informational and are not professional financial, legal, audit, or compliance advice.
      </P>

      <H2>9. Limitation of liability</H2>
      <P>
        To the maximum extent permitted by law, neither party is liable for indirect, incidental, special,
        consequential, or punitive damages. Except for breaches of confidentiality or your payment obligations, each
        party&rsquo;s total liability arising out of these Terms will not exceed the fees paid or payable by you for the
        Service in the twelve months preceding the claim.
      </P>

      <H2>10. Indemnification</H2>
      <P>
        You will defend and indemnify KYRO against claims arising from Customer Data or your use of the Service in
        breach of these Terms. KYRO will defend and indemnify you against third-party claims that the Service infringes
        their intellectual-property rights.
      </P>

      <H2>11. Term &amp; termination</H2>
      <P>
        These Terms apply while you use the Service. Either party may terminate for material breach that remains
        uncured after 30 days&rsquo; notice. On termination, your right to use the Service ends; you may export or
        request deletion of Customer Data, and we will delete it in accordance with our Privacy Policy and applicable
        retention obligations.
      </P>

      <H2>12. Changes</H2>
      <P>
        We may update these Terms from time to time. Material changes will be communicated through the Service or by
        email; continued use after the effective date constitutes acceptance.
      </P>

      <H2>13. Governing law</H2>
      <P>
        These Terms are governed by the laws of the State in which KYRO is organized, without regard to conflict-of-law
        rules, and the parties consent to the exclusive jurisdiction of the courts located there.
      </P>

      <H2>14. Contact</H2>
      <P>
        Questions about these Terms: <a className="font-semibold text-gold underline" href="mailto:support@ourkyro.com">support@ourkyro.com</a>.
      </P>

      <P>
        <em className="text-muted">
          This page is a general template and does not constitute legal advice. KYRO recommends review by qualified
          counsel before relying on it.
        </em>
      </P>
    </LegalPage>
  )
}

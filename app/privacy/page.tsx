import type { ReactNode } from "react";
import type { Metadata } from "next";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = {
  title: "Privacy policy — SkyWin Field",
  description: "How the SkyWin Field app collects, uses, and shares information.",
};

const UPDATED = "26 October 2026";

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-12 text-[#1E3317] sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2E4A22]/60">SkyWin Field</p>
      <h1 className="mt-2 text-3xl font-bold">Privacy policy</h1>
      <p className="mt-2 text-sm text-[#2E4A22]/70">Last updated {UPDATED}</p>

      <div className="mt-8 space-y-8 text-[15px] leading-7">
        <section className="space-y-3">
          <p>
            This policy explains how {BUSINESS.name} (“SkyWin”, “we”) handles information in the
            SkyWin Field mobile app (Android package <span className="font-medium">com.skywin.field</span>)
            and in the field records that app shares with our staff tools. SkyWin Field is for field
            officers and farmers. It is not directed at children under 18.
          </p>
          <p>
            {BUSINESS.name}, {BUSINESS.address}. Phone {BUSINESS.phone}. Email{" "}
            <a className="underline" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.
          </p>
        </section>

        <Section title="Information the app collects">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Account.</strong> Your mobile number, the role you choose (field officer or farmer),
              and the time you signed in. Sign-in uses a one-time code sent to that number on WhatsApp.
              The number and role stay on the phone until you sign out.
            </li>
            <li>
              <strong>Farmer and farm records.</strong> Name, phone numbers, village, territory, address,
              PIN code, language, crops, acres, farm location the officer saves, assigned officer,
              approval status, reward points, payment mode, and a photo of the farmer when one is taken.
            </li>
            <li>
              <strong>Camera.</strong> Used only when someone chooses to photograph a farmer during
              registration. The photo is stored with that farmer’s record.
            </li>
            <li>
              <strong>Location.</strong> If you allow it, the app reads your approximate or precise
              location to show local weather and spray advice. Those coordinates are sent to Open-Meteo
              to fetch the forecast. They are kept in memory on the phone for a short time and are not
              saved as a location history on SkyWin’s servers. If you decline, the app uses Kumbakonam
              as the place name and does not send your GPS location. A farm’s saved GPS, when an officer
              enters it, is stored with the farm record.
            </li>
            <li>
              <strong>Orders.</strong> Products, quantities, prices, delivery address, and the status of
              the order.
            </li>
            <li>
              <strong>Payments.</strong> Orders can be paid through Razorpay. Razorpay collects the
              payment details you enter (such as UPI or card). SkyWin stores the order and the payment
              reference Razorpay returns. SkyWin does not store your full card number.
            </li>
            <li>
              <strong>Clipboard.</strong> If you tap paste on the sign-in code screen, the app reads the
              clipboard once to fill the code. It does not read the clipboard in the background.
            </li>
          </ul>
        </Section>

        <Section title="How we use it">
          <p>We use this information to:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>sign you in and keep the session on your phone;</li>
            <li>show and update farmer, farm, product, and order records;</li>
            <li>send the WhatsApp sign-in code;</li>
            <li>show weather and spray advice for the field;</li>
            <li>take payment for SkyWin products and arrange delivery;</li>
            <li>keep invoices, tax records, and business accounts.</li>
          </ul>
          <p>We do not sell personal information. The app does not show ads.</p>
        </Section>

        <Section title="Who else receives it">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>SkyWin systems.</strong> Farmer, farm, and order records are stored on SkyWin’s
              servers so the phone app and our staff can work from the same list.
            </li>
            <li>
              <strong>Interakt and WhatsApp.</strong> Your mobile number and the one-time sign-in code
              are sent to Interakt so the code can be delivered on WhatsApp.
            </li>
            <li>
              <strong>Razorpay.</strong> When you pay in the app, Razorpay processes the payment under
              its own privacy policy at razorpay.com.
            </li>
            <li>
              <strong>Open-Meteo.</strong> Latitude and longitude are sent only to fetch the weather
              forecast, and only if location permission is allowed.
            </li>
            <li>
              <strong>Delhivery.</strong> When an order is shipped, the recipient’s name, phone, address,
              and PIN code are shared with Delhivery so the parcel can be delivered.
            </li>
          </ul>
          <p>
            Staff see a record only as needed for field work, billing, delivery, or support. We may also
            disclose information if the law requires it.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            Farmer and order records are kept while they are needed to run the business and for the
            period required for tax and accounting records. The sign-in code is used only to complete
            that sign-in. Weather coordinates are not stored as a history on our servers. You can ask us
            to correct or delete a farmer profile by emailing {BUSINESS.email}. We may retain what we
            must keep for a legal, tax, or security reason, and we may keep a record of the request.
          </p>
        </Section>

        <Section title="Security">
          <p>
            The app talks to SkyWin over HTTPS. Access to the staff tools is limited to signed-in
            accounts. No method of storage or transmission is perfectly secure.
          </p>
        </Section>

        <Section title="Your choices">
          <ul className="list-disc space-y-2 pl-5">
            <li>You can deny camera or location permission in Android settings. Those features then stay off.</li>
            <li>You can sign out, which removes the saved session from the phone.</li>
            <li>
              To review, correct, or delete information we hold, email{" "}
              <a className="underline" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> with the
              mobile number on the account.
            </li>
          </ul>
        </Section>

        <Section title="Changes">
          <p>
            We will post any change on this page and update the date above. Continued use of SkyWin Field
            after a change means the updated policy applies.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            {BUSINESS.name}
            <br />
            {BUSINESS.address}
            <br />
            Phone: {BUSINESS.phone}
            <br />
            Email: <a className="underline" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
            <br />
            Website:{" "}
            <a className="underline" href="https://skywingroups.com">skywingroups.com</a>
          </p>
        </Section>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

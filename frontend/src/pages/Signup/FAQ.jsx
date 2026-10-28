import { useState } from 'react';
import { ChevronDownIcon, ChevronLeftIcon, ChevronUpIcon } from '../../components/common/Icons.jsx';
import { SignupLayout } from '../../stepper/SignupStepper.jsx';

// Text copied from the Figma.
const FAQS = [
  ['How long does verification typically take?', "Verification usually takes 1-2 business hours. You'll receive an email notification once completed."],
  ["What should I do if I don't receive the access key?", "Check your spam folder first. If not found, click 'Resend Access Key' in your verification email or contact support."],
  ['Can I use multiple devices with one account?', 'Your account supports access on multiple devices while ensuring a smooth experience.'],
  ['How do I reset my password?', "Click 'Forgot Password' on the login screen and follow the instructions sent to your email."],
];

export default function FAQ({ onBack }) {
  const [open, setOpen] = useState(null); // one open item at a time; PENDING: the Figma shows all open in one frame

  return (
    <SignupLayout current={6}>
      <div className="info-page">
        <h1 className="info-page__title">
          <button type="button" className="info-page__back" onClick={onBack} aria-label="Back"><ChevronLeftIcon size={16} /></button>
          Frequently asked questions
        </h1>
        <div className="faq">
          {FAQS.map(([question, answer], i) => (
            <div className="faq__item" key={question}>
              <button type="button" className="faq__q" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                {question}
                {open === i ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
              </button>
              {open === i && <p className="faq__a">{answer}</p>}
            </div>
          ))}
        </div>
      </div>
    </SignupLayout>
  );
}

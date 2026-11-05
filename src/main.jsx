import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDown, ArrowUpRight, ArrowRight, Menu, X, Code2, Palette, Smartphone,
  Workflow, ShieldCheck, MessageCircle, Sparkles, Monitor, Layers3, Check,
  Cpu, Terminal, BriefcaseBusiness, Rocket, Play, ChevronDown
} from 'lucide-react';
import './style.css';

const services = [
  ['5-Page Business Website','₹9,999','A sharp, responsive digital home for your business.'],
  ['Premium Website Development','₹30,999','Custom design, rich motion and a memorable experience.'],
  ['Admin Panel Development','₹99,999','Secure dashboards, roles, records and operations.'],
  ['E-commerce Website','₹99,999','Product catalogue, cart, orders and management.'],
  ['Finance Website','₹35,999','Member dashboards and carefully built transaction flows.'],
  ['Gaming Website','₹50,000','Immersive gaming portals, profiles and tournament UI.'],
  ['Android Application','₹79,999','Mobile-first product experiences and integrations.'],
  ['Business Web Application','₹90,000','Custom portals, workflows and business tools.'],
  ['WhatsApp Automation SaaS','₹25,000','Customer conversations and approved messaging workflows.'],
  ['Instagram Automation SaaS','₹20,999','Business messaging and supported social workflows.'],
  ['Facebook Business SaaS','₹14,999','Page enquiry management and business integrations.'],
  ['Custom AI Automation','₹9,999','Practical AI workflows built around your operations.']
];

const departments = [
  { no:'01', role:'Project Consultant', title:'First, we listen.', desc:'Your goals, users, timeline and budget become a clear project brief.', icon:BriefcaseBusiness, tag:'DISCOVERY' },
  { no:'02', role:'UI / UX Designer', title:'Then, we shape it.', desc:'Information architecture, user journeys and a visual direction made for your brand.', icon:Palette, tag:'DESIGN STUDIO' },
  { no:'03', role:'Frontend Developer', title:'Make it feel alive.', desc:'Responsive interfaces, purposeful interactions and polished motion.', icon:Code2, tag:'INTERACTIVE BUILD' },
  { no:'04', role:'Backend Developer', title:'Build the engine.', desc:'APIs, databases, authentication and dependable application logic.', icon:Terminal, tag:'ENGINEERING' },
  { no:'05', role:'App & Automation Specialist', title:'Connect the workflow.', desc:'Mobile experiences, integrations and automation that save real effort.', icon:Workflow, tag:'SYSTEMS LAB' },
  { no:'06', role:'QA & Delivery', title:'Ready for the real world.', desc:'Device checks, quality review, launch preparation and handover.', icon:ShieldCheck, tag:'QUALITY CONTROL' }
];

function EnquiryForm() {
  const [status, setStatus] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setStatus('');
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch('/api/enquiries', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Submission failed');
      form.reset(); setStatus('Your project brief has reached our studio. We will be in touch soon.');
    } catch (error) { setStatus(error.message || 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }
  return <form className="enquiry-form" onSubmit={submit}>
    <div className="form-row"><input name="name" placeholder="Your name" required maxLength="120"/><input name="email" type="email" placeholder="Email address" required maxLength="180"/></div>
    <div className="form-row"><input name="phone" placeholder="Phone / WhatsApp"/><select name="service" defaultValue=""><option value="">Choose a department / service</option>{services.map(s=><option key={s[0]}>{s[0]}</option>)}</select></div>
    <select name="budget" defaultValue=""><option value="">Project budget (optional)</option><option>Under ₹10,000</option><option>₹10,000 – ₹30,000</option><option>₹30,000 – ₹75,000</option><option>₹75,000 – ₹1,50,000</option><option>₹1,50,000+</option></select>
    <textarea name="message" placeholder="What are we building together?" required minLength="10" maxLength="4000" rows="4"/>
    <button className="button button-dark" disabled={busy}>{busy ? 'Sending brief…' : 'Send project brief'} <ArrowUpRight size={17}/></button>
    {status && <p className="form-status" role="status">{status}</p>}
  </form>;
}

function App() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeRoom, setActiveRoom] = React.useState(0);
  React.useEffect(() => {
    const nodes = document.querySelectorAll('[data-reveal]');
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.12 });
    nodes.forEach(node => observer.observe(node));
    const onPointer = e => {
      const stage = document.querySelector('.office-stage');
      if (!stage || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const rect = stage.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - .5;
      const y = (e.clientY - rect.top) / rect.height - .5;
      stage.style.setProperty('--pointer-x', (x * 7).toFixed(2) + 'deg');
      stage.style.setProperty('--pointer-y', (y * -5).toFixed(2) + 'deg');
    };
    window.addEventListener('pointermove', onPointer, { passive:true });
    return () => { observer.disconnect(); window.removeEventListener('pointermove', onPointer); };
  }, []);

  const goTo = id => { setMenuOpen(false); document.getElementById(id)?.scrollIntoView({ behavior:'smooth' }); };

  return <>
    <div className="announcement"><span className="live-dot"/> INDEPENDENT DIGITAL STUDIO <span className="announcement-sep">/</span> PUNE · INDIA <span className="announcement-right">IDEAS IN. IMPACT OUT.</span></div>
    <header className="site-nav">
      <a className="brand" href="#home" aria-label="AI SOFT STUDIO home"><span className="brand-symbol">AI<span>✳</span></span><span className="brand-name">AI SOFT <b>STUDIO</b><small>DESIGN · CODE · AUTOMATION</small></span></a>
      <nav className={menuOpen ? 'nav-links open' : 'nav-links'}><a href="#experience" onClick={()=>setMenuOpen(false)}>The studio</a><a href="#team" onClick={()=>setMenuOpen(false)}>Meet the team</a><a href="#services" onClick={()=>setMenuOpen(false)}>What we build</a><a href="#process" onClick={()=>setMenuOpen(false)}>Our process</a></nav>
      <a className="nav-contact" href="#contact">Start a project <ArrowUpRight size={15}/></a>
      <button className="menu-toggle" onClick={()=>setMenuOpen(!menuOpen)} aria-label={menuOpen?'Close menu':'Open menu'}>{menuOpen?<X/>:<Menu/>}</button>
    </header>

    <main id="home">
      <section className="hero-office">
        <div className="hero-copy" data-reveal>
          <div className="kicker"><span className="kicker-line"/> YOUR IDEA HAS A PLACE HERE</div>
          <h1>Welcome to<br/>the <em>workshop.</em></h1>
          <p className="hero-intro">Step inside AI SOFT STUDIO. Meet the people behind the pixels, talk through your idea and watch it become a digital product.</p>
          <div className="hero-buttons"><a className="button button-orange" href="#experience">Walk into the studio <ArrowDown size={16}/></a><a className="text-button" href="#services"><span className="play-icon"><Play size={11} fill="currentColor"/></span> Explore what we create</a></div>
          <div className="hero-meta"><span><i/> AVAILABLE FOR SELECT PROJECTS</span><span>EST. 2024 · INDIA</span></div>
        </div>
        <div className="office-stage" aria-label="Illustrated cinematic view into a modern orange and black creative technology studio">
          <div className="stage-glow"/>
          <div className="stage-grid"/>
          <div className="office-ceiling"><span>AI SOFT STUDIO</span><i/></div>
          <div className="office-backwall"><div className="wall-logo">AI<span>✳</span><small>SOFT STUDIO</small></div><div className="wall-screen"><div className="screen-top"><i/><i/><i/><span>STUDIO / LIVE SYSTEMS</span></div><div className="screen-code"><b>const</b> idea = <em>"yours"</em>;<br/><b>build</b>(idea).<i>launch</i>();<div className="screen-bars"><i/><i/><i/><i/><i/></div></div></div></div>
          <div className="office-window"><span>CREATIVE THINKING<br/>BUILT DAILY</span><div className="window-glow"/></div>
          <div className="office-desk desk-left"><div className="monitor"><div className="monitor-ui"><i/><i/><i/><b>DESIGN / 01</b><span/><span/><span/></div></div><div className="desk-leg"/></div>
          <div className="office-desk desk-right"><div className="monitor monitor-wide"><div className="monitor-ui code-ui"><i/><i/><i/><b>DEVELOPMENT / 02</b><span/><span/><span/><span/></div></div><div className="desk-leg"/></div>
          <div className="chair chair-one"/><div className="chair chair-two"/>
          <div className="stage-floor"/>
          <div className="stage-caption"><span>01 / THE FRONT DOOR</span><span>MOVE THROUGH OUR WORLD <ArrowUpRight size={12}/></span></div>
          <div className="floating-stamp"><Sparkles size={15}/> IDEAS<br/>WELCOME</div>
        </div>
        <div className="hero-scroll"><span>SCROLL TO ENTER</span><div/></div>
      </section>

      <section className="ticker"><div>THINK <i>✳</i> DESIGN <i>✳</i> ENGINEER <i>✳</i> AUTOMATE <i>✳</i> LAUNCH <i>✳</i> THINK <i>✳</i> DESIGN <i>✳</i> ENGINEER <i>✳</i> AUTOMATE <i>✳</i></div></section>

      <section className="experience-section" id="experience">
        <div className="section-topline"><span>02 / TAKE A LOOK AROUND</span><span>THE AI SOFT STUDIO EXPERIENCE</span></div>
        <div className="experience-heading" data-reveal><div><div className="kicker">NOT JUST A WEBSITE. A WORKING STUDIO.</div><h2>Every great build<br/>starts with a <em>conversation.</em></h2></div><p>We bring the right minds around your idea. Explore the rooms, meet the roles and see how a project moves from first thought to final launch.</p></div>
        <div className="room-layout">
          <div className="room-tabs">{departments.map((d,i)=><button key={d.no} className={activeRoom===i?'room-tab active':'room-tab'} onClick={()=>setActiveRoom(i)}><span>{d.no}</span><b>{d.role}</b><ArrowUpRight size={15}/></button>)}</div>
          <div className="room-display" key={activeRoom}>
            <div className="room-visual"><div className="room-halo"/><div className="room-orbit orbit-a"/><div className="room-orbit orbit-b"/><div className="room-icon">{React.createElement(departments[activeRoom].icon,{size:43,strokeWidth:1.2})}</div><span className="room-visual-label">AI / STUDIO / {departments[activeRoom].no}</span><div className="room-visual-floor"/></div>
            <div className="room-info"><span className="room-tag">{departments[activeRoom].tag}</span><h3>{departments[activeRoom].title}</h3><p>{departments[activeRoom].desc}</p><div className="room-role"><span>YOU'LL MEET</span><b>{departments[activeRoom].role}</b></div><a href="#contact" className="room-link">Talk to our studio <ArrowUpRight size={15}/></a></div>
          </div>
        </div>
        <div className="experience-note"><Sparkles size={15}/> Real people. Clear roles. One connected team working on your brief.</div>
      </section>

      <section className="team-section" id="team">
        <div className="section-topline"><span>03 / THE PEOPLE BEHIND THE WORK</span><span>ONE STUDIO · MANY SPECIALTIES</span></div>
        <div className="team-intro" data-reveal><div><div className="kicker">GOOD WORK IS A TEAM SPORT</div><h2>Meet your project<br/><em>people.</em></h2></div><p>Every project is matched with the right skill set. No mystery hand-offs — just a team that knows what it is building and why.</p></div>
        <div className="team-grid">{departments.map((d,i)=><article className="team-card" key={d.no} data-reveal><div className="team-card-top"><span>TEAM / {d.no}</span><span className="team-card-dot"/></div><div className="team-avatar"><div className="avatar-ring"/>{React.createElement(d.icon,{size:34,strokeWidth:1.25})}<span>{String(i+1).padStart(2,'0')}</span></div><div className="team-card-bottom"><small>{d.tag}</small><h3>{d.role}</h3><p>{d.desc}</p></div><a href="#contact" aria-label={'Discuss your project with '+d.role}><ArrowUpRight size={17}/></a></article>)}</div>
        <p className="team-disclaimer">Meet the role your project needs. Specific team members are introduced during your project consultation.</p>
      </section>

      <section className="services-section" id="services">
        <div className="section-topline"><span>04 / THE BUILD FLOOR</span><span>FROM FIRST PIXEL TO FULL PLATFORM</span></div>
        <div className="services-heading" data-reveal><div><div className="kicker">WHAT WE CAN MAKE TOGETHER</div><h2>Pick your starting<br/><em>point.</em></h2></div><p>Websites, applications, platforms and automation. Choose a direction and we'll help shape the right solution.</p></div>
        <div className="services-grid">{services.map((s,i)=><article className="service-card" key={s[0]} data-reveal><div className="service-card-head"><span>BUILD / {String(i+1).padStart(2,'0')}</span><ArrowUpRight size={17}/></div><div className="service-icon">{[<Monitor/>,<Layers3/>,<Workflow/>,<BriefcaseBusiness/>,<ShieldCheck/>,<Sparkles/>,<Smartphone/>,<Cpu/>][i%8]}</div><h3>{s[0]}</h3><p>{s[2]}</p><div className="service-price">{s[1]} <small>onwards</small></div><a href="#contact" onClick={()=>{}}>Discuss this build <ArrowRight size={14}/></a></article>)}</div>
      </section>

      <section className="lab-section">
        <div className="lab-art"><div className="lab-ring ring-one"/><div className="lab-ring ring-two"/><div className="lab-core"><span>AI</span><i>✳</i></div><div className="lab-orbit-label label-one">DESIGN SYSTEMS</div><div className="lab-orbit-label label-two">SMART AUTOMATION</div><div className="lab-orbit-label label-three">SOFTWARE ENGINEERING</div></div>
        <div className="lab-copy" data-reveal><div className="kicker">05 / THE EXPERIMENTS LAB</div><h2>Curious minds.<br/><em>Useful technology.</em></h2><p>We explore new tools, test ideas and connect the dots between design, software and automation — always with a practical outcome in mind.</p><div className="lab-points"><span><Check size={14}/> Thoughtful use of AI</span><span><Check size={14}/> Modern web technology</span><span><Check size={14}/> Systems built to scale</span></div><a className="text-button" href="#contact">Bring us a challenge <ArrowUpRight size={15}/></a></div>
      </section>

      <section className="process-section" id="process">
        <div className="section-topline"><span>06 / FROM HELLO TO LAUNCH</span><span>YOUR PROJECT, IN MOTION</span></div>
        <div className="process-heading" data-reveal><div className="kicker">NO GUESSWORK. A CLEAR ROUTE.</div><h2>Here's how we<br/><em>get it moving.</em></h2></div>
        <div className="process-track">{[['01','Meet','We hear the idea and understand the outcome you want.'],['02','Map','We define scope, features, timeline and investment.'],['03','Make','Design and development turn the plan into a product.'],['04','Test','We check the details across screens and workflows.'],['05','Launch','Your product goes live with a clear handover.']].map((p,i)=><div className="process-step" key={p[0]} data-reveal><span className="step-number">{p[0]}</span><div className="step-node"/><h3>{p[1]}</h3><p>{p[2]}</p></div>)}</div>
      </section>

      <section className="contact-section" id="contact">
        <div className="contact-terminal"><div className="terminal-top"><span><i/><i/><i/></span><b>AI_SOFT_STUDIO / NEW_PROJECT</b><span>SECURE ENQUIRY</span></div><div className="terminal-body"><div className="terminal-prompt"><span>visitor@studio:~$</span> start a_project</div><h2>Let's build<br/><em>something real.</em></h2><p>Leave your brief at the desk. Our team will review it and get back to you about the next step.</p><EnquiryForm/></div><div className="terminal-foot"><span>END OF TOUR / BEGINNING OF SOMETHING</span><span>AI SOFT STUDIO © {new Date().getFullYear()}</span></div></div>
      </section>
    </main>

    <footer className="site-footer"><a className="brand" href="#home"><span className="brand-symbol">AI<span>✳</span></span><span className="brand-name">AI SOFT <b>STUDIO</b><small>DESIGN · CODE · AUTOMATION</small></span></a><span className="footer-note">MADE WITH INTENT. BUILT TO MOVE.</span><a href="mailto:hello@aisoftautomation.com">hello@aisoftautomation.com <ArrowUpRight size={13}/></a><a className="back-top" href="#home">BACK TO TOP ↑</a></footer>
    <a className="floating-contact" href="#contact"><MessageCircle size={17}/><span>Talk to the studio</span></a>
  </>;
}

createRoot(document.getElementById('root')).render(<App/>);

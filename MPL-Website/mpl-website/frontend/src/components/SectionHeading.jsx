export default function SectionHeading({ eyebrow, title, description, align = 'left', as: Heading = 'h2' }) {
  return <div className={`section-heading section-heading--${align}`}>
    {eyebrow && <span className="eyebrow"><i />{eyebrow}</span>}
    <Heading>{title}</Heading>
    {description && <p>{description}</p>}
  </div>;
}

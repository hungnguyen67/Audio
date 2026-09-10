const tableStyle = {
  display: 'grid',
  gridTemplateColumns: '44px minmax(0, 1fr) 140px 96px',
  gap: 24,
  alignItems: 'center',
  width: '100%',
  padding: '8px 16px',
  fontFamily: "'DM Sans', 'Trebuchet MS', sans-serif",
  fontSize: '.95rem',
  lineHeight: 1.25,
  textAlign: 'left',
};

const headerStyle = {
  ...tableStyle,
  minHeight: 46,
  color: '#5f6870',
  background: '#f0f2f3',
  fontSize: '.75rem',
  fontWeight: 700,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
};

const rowStyle = {
  ...tableStyle,
  border: 0,
  borderTop: '1px solid #d8dde1',
  color: '#111315',
  background: '#fff',
  cursor: 'pointer',
};

export function StoryTable({ stories, onOpen, actionLabel = 'Open', renderAction }) {
  return <div style={{ overflow: 'hidden', border: '1px solid #d8dde1', borderRadius: 10 }}>
    <div style={headerStyle}><span>#</span><span>Title</span><span>Chapters</span><span>Actions</span></div>
    {stories.map((story, index) => <div key={story.id} style={rowStyle} onClick={() => onOpen?.(story)}>
      <span style={{ color: '#5f6870' }}>{index + 1}</span>
      <strong style={{ overflow: 'hidden', color: '#111315', fontWeight: 700, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.title}</strong>
      <span style={{ color: '#5f6870' }}>{story.chapters.length} chapters</span>
      <span style={{ justifySelf: 'end' }}>{renderAction ? renderAction(story) : <span style={{ boxSizing: 'border-box', width: 72, display: 'inline-block', padding: '6px 8px', border: '1px solid #d8dde1', borderRadius: 9, color: '#111a1e', background: '#fff', fontSize: '.85rem', fontWeight: 700, textAlign: 'center' }}>{actionLabel}</span>}</span>
    </div>)}
  </div>;
}

export default function BookLogo({
  className = "brandmark",
}: {
  className?: string;
}) {
  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 64 64" role="img" focusable="false">
        <path d="M8 13.5c0-2 1.7-3.5 3.7-3.2 7.3 1 13.5 3.7 18.3 7.7v33.2c-4.8-3.9-11-6.6-18.3-7.6A3.2 3.2 0 0 1 8 40.4V13.5Z" />
        <path d="M56 13.5c0-2-1.7-3.5-3.7-3.2-7.3 1-13.5 3.7-18.3 7.7v33.2c4.8-3.9 11-6.6 18.3-7.6a3.2 3.2 0 0 0 3.7-3.2V13.5Z" />
        <path className="book-logo-line" d="M32 18v35" />
      </svg>
    </span>
  );
}

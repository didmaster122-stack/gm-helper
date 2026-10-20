import { forwardRef, type InputHTMLAttributes } from "react";
import { Search } from "lucide-react";

/** The main search of a screen carries this attribute; Ctrl+F focuses it. */
export const SCREEN_SEARCH_SELECTOR = "[data-screen-search]";

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** This is the screen's main search (Ctrl+F). */
  screenSearch?: boolean;
  wrapperClassName?: string;
}

/** Text field with a search icon. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { screenSearch = false, wrapperClassName, title, placeholder, ...rest },
  ref,
) {
  return (
    <div className={wrapperClassName ? `search-input ${wrapperClassName}` : "search-input"}>
      <Search aria-hidden />
      <input
        ref={ref}
        type="search"
        placeholder={placeholder}
        aria-label={rest["aria-label"] ?? placeholder}
        title={title ?? (screenSearch ? "Ctrl+F" : undefined)}
        data-screen-search={screenSearch ? "" : undefined}
        spellCheck={false}
        {...rest}
      />
    </div>
  );
});

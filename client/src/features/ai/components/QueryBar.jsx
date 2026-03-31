import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Search, X, CheckCircle, AlertCircle } from 'lucide-react';
import { queryGraph, resetAiState, selectAiQueryState } from '../slices/aiSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function QueryBar({ jobId }) {
  const dispatch = useDispatch();
  const queryState = useSelector(selectAiQueryState);
  const [question, setQuestion] = useState('');
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef(null);

  const { status, data, error } = queryState;
  const isLoading = status === 'loading';
  const hasResult = data && status === 'succeeded';
  const hasError = error && status === 'failed';
  const highlightCount = data?.highlightedFiles?.length || 0;

  // Auto-focus input when expanded
  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!question.trim() || !jobId) return;

    dispatch(queryGraph({ question, jobId }));
  };

  const handleClear = () => {
    setQuestion('');
    dispatch(resetAiState());
    setExpanded(false);
  };

  const handleInputChange = (e) => {
    setQuestion(e.target.value);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk(e);
    }
  };

  return (
    <div className="relative w-full">
      {/* Minimalist Query Input */}
      <div
        className={`transition-all duration-500 ease-[var(--ease-out)] ${
          expanded || hasResult
            ? 'shadow-neu-flat rounded-xl bg-background/60'
            : 'shadow-neu-inset rounded-full bg-background/40 hover:bg-background/60'
        }`}
      >
        <form onSubmit={handleAsk} className="flex items-center gap-2 px-4 py-3">
          <Search className="size-4 text-muted-foreground shrink-0" />

          <input
            ref={inputRef}
            type="text"
            placeholder={jobId ? 'Ask about your codebase...' : 'Load analysis first'}
            value={question}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setExpanded(true)}
            disabled={!jobId || isLoading}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          />

          {question && (
            <button
              type="button"
              onClick={() => setQuestion('')}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          )}

          <Button
            type="submit"
            size="sm"
            variant="neumo"
            disabled={!question.trim() || !jobId || isLoading}
            className="ml-auto"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Searching
              </span>
            ) : (
              'Ask AI'
            )}
          </Button>
        </form>

        {/* Results Display */}
        {(hasResult || hasError) && (
          <div
            className={`transition-all duration-500 animate-in fade-in slide-in-from-top-2 ${
              hasResult
                ? 'border-t border-border/10 bg-gradient-to-b from-transparent to-background/20'
                : 'border-t border-destructive/10 bg-destructive/5'
            }`}
          >
            <div className="px-4 py-3 space-y-3">
              {/* Answer Section */}
              {hasResult && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="size-4 text-emerald-500/70 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-relaxed">
                        {data.answer}
                      </p>
                    </div>
                  </div>

                  {/* Highlighted Files Feedback */}
                  {highlightCount > 0 && (
                    <div className="flex items-center gap-2 pl-6 pt-1">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
                        <span className="size-1.5 bg-primary/60 rounded-full" />
                        <span className="text-xs font-medium text-primary">
                          Highlighting {highlightCount} file{highlightCount !== 1 ? 's' : ''}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Error Section */}
              {hasError && (
                <div className="flex items-start gap-2">
                  <AlertCircle className="size-4 text-destructive/70 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-destructive/80">
                      {error.message || 'Failed to query repository'}
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1 pl-6">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleClear}
                  className="text-xs h-8 px-2"
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Subtle hint when not expanded */}
      {!expanded && !hasResult && jobId && (
        <p className="text-xs text-muted-foreground mt-2 px-4">
          Ask questions about your codebase architecture, dependencies, and design patterns.
        </p>
      )}
    </div>
  );
}

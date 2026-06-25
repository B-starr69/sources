#!/usr/bin/env python3
"""
Stream Text Processor - Deletes text between specified start and end delimiters
Usage: cat file.txt | python text_processor.py --start "START" --end "END" --output result.txt
       echo "some text START middle text END more text" | python text_processor.py -s "START" -e "END" -o output.txt
"""

import sys
import argparse
import re
import os

def process_stream(start_delimiter, end_delimiter, keep_delimiters=False, case_sensitive=True):
    """
    Read from stdin and remove everything between start and end delimiters,
    including the delimiters themselves (unless keep_delimiters is True).
    """
    # Read all input from stdin
    input_text = sys.stdin.read()

    if not input_text:
        return ""

    # Build regex pattern
    pattern = re.escape(start_delimiter) + r'(.*?)' + re.escape(end_delimiter)
    flags = re.DOTALL
    if not case_sensitive:
        flags |= re.IGNORECASE

    if keep_delimiters:
        # Replace the middle part only, keep delimiters
        def replace_match(match):
            return start_delimiter + end_delimiter
        result = re.sub(pattern, replace_match, input_text, flags=flags)
    else:
        # Remove everything including delimiters
        result = re.sub(pattern, '', input_text, flags=flags)

    return result

def process_stream_line_by_line(start_delimiter, end_delimiter, keep_delimiters=False, case_sensitive=True):
    """
    Alternative: Process line by line instead of the entire stream at once.
    Useful for very large files.
    """
    result_lines = []

    for line in sys.stdin:
        pattern = re.escape(start_delimiter) + r'(.*?)' + re.escape(end_delimiter)
        flags = 0
        if not case_sensitive:
            flags |= re.IGNORECASE

        if keep_delimiters:
            def replace_match(match):
                return start_delimiter + end_delimiter
            line = re.sub(pattern, replace_match, line, flags=flags)
        else:
            line = re.sub(pattern, '', line, flags=flags)

        result_lines.append(line)

    return ''.join(result_lines)

def save_output(content, output_file, append_mode=False, show_preview=False):
    """
    Save the processed content to a file.
    """
    try:
        if append_mode:
            mode = 'a'
            action = "Appended"
        else:
            mode = 'w'
            action = "Saved"

        with open(output_file, mode, encoding='utf-8') as f:
            f.write(content)

        # Get file size
        file_size = os.path.getsize(output_file)

        print(f"\n✓ {action} to: {output_file}", file=sys.stderr)
        print(f"  File size: {file_size} bytes ({file_size/1024:.2f} KB)", file=sys.stderr)

        # Show preview if requested
        if show_preview and content:
            preview_lines = content.split('\n')[:5]
            preview = '\n'.join(preview_lines)
            if len(content.split('\n')) > 5:
                preview += "\n..."
            print(f"\nPreview (first 5 lines):\n{preview}", file=sys.stderr)

        return True

    except IOError as e:
        print(f"Error saving to file: {e}", file=sys.stderr)
        return False

def main():
    parser = argparse.ArgumentParser(
        description='Remove text between specified start and end delimiters from stream input and save to file',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Remove everything between [START] and [END] including the tags and save to file
  echo "Hello [START]secret[END] world" | python text_processor.py -s "[START]" -e "[END]" -o output.txt

  # Keep the delimiters, remove only the middle text
  echo "Hello [START]secret[END] world" | python text_processor.py -s "[START]" -e "[END]" -k -o output.txt

  # Case-insensitive matching and append to existing file
  echo "Hello [start]secret[End] world" | python text_processor.py -s "[START]" -e "[END]" -i -a -o output.txt

  # Process a file line by line (for large files)
  cat largefile.txt | python text_processor.py -s "BEGIN" -e "END" -l -o output.txt

  # Show preview of saved content
  cat input.txt | python text_processor.py -s "DELETE" -e "END" -o output.txt --preview

  # Also print to stdout while saving to file
  cat input.txt | python text_processor.py -s "REMOVE" -e "STOP" -o output.txt --print
        """
    )

    parser.add_argument('-s', '--start', required=True,
                        help='Starting delimiter text')
    parser.add_argument('-e', '--end', required=True,
                        help='Ending delimiter text')
    parser.add_argument('-o', '--output', required=True,
                        help='Output file path to save the result')
    parser.add_argument('-a', '--append', action='store_true',
                        help='Append to output file instead of overwriting')
    parser.add_argument('-k', '--keep-delimiters', action='store_true',
                        help='Keep the start/end delimiters, only delete the content between them')
    parser.add_argument('-i', '--ignore-case', action='store_true',
                        help='Case insensitive matching')
    parser.add_argument('-l', '--line-by-line', action='store_true',
                        help='Process line by line (useful for very large files)')
    parser.add_argument('--preview', action='store_true',
                        help='Show preview of saved content in stderr')
    parser.add_argument('--print', dest='print_output', action='store_true',
                        help='Also print the result to stdout')

    args = parser.parse_args()

    try:
        # Process the input
        if args.line_by_line:
            result = process_stream_line_by_line(
                args.start, args.end,
                args.keep_delimiters,
                not args.ignore_case
            )
        else:
            result = process_stream(
                args.start, args.end,
                args.keep_delimiters,
                not args.ignore_case
            )

        # Save to file
        if save_output(result, args.output, args.append, args.preview):
            # Optionally print to stdout
            if args.print_output:
                sys.stdout.write(result)

            # Print statistics
            original_size = len(sys.stdin.buffer.read()) if hasattr(sys.stdin, 'buffer') else 0
            # Note: Can't easily get original size after reading, so provide useful info
            print(f"\n✓ Processing complete!", file=sys.stderr)

        else:
            sys.exit(1)

    except KeyboardInterrupt:
        sys.stderr.write("\n✗ Processing interrupted by user\n")
        sys.exit(1)
    except BrokenPipeError:
        # Handle piping to commands that close early
        sys.stderr.close()
        sys.exit(1)
    except Exception as e:
        sys.stderr.write(f"✗ Error: {e}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()

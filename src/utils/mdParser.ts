export function mdToHtml(lines: string[]) {
    let html = '';
    let listStack: number[] = [];
    let currentIndent = 0;
    let headerStack: { level: number; text: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (trimmedLine === '') {
            continue;
        }

        const indent = line.match(/^(\s*)/)?.[1].length || 0;

        // Handle headers
        if (trimmedLine.startsWith('#')) {
            const headerMatch = trimmedLine.match(/^(#+)\s*(.*)/);
            if (headerMatch) {
                const headerLevel = headerMatch[1].length;
                const headerText = headerMatch[2].trim();

                // Close previous lists
                while (listStack.length > 0) {
                    html += '</ul>\n';
                    listStack.pop();
                }

                // Close headers until we reach the correct nesting level
                while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= headerLevel) {
                    html += '</div>\n</details>\n';
                    const lastHeader = headerStack.pop();
                    // Add content div close if this header had content
                    if (headerStack.length === 0 || headerStack[headerStack.length - 1].level < headerLevel) {
                    }
                }

                // Add new header
                html += `<details class="collapse-section">\n<summary>${processInlineFormatting(headerText)}</summary>\n<div class="content">\n`;
                headerStack.push({ level: headerLevel, text: headerText });
                currentIndent = 0;
                continue;
            }
        }

        // Handle list items
        if (trimmedLine.startsWith('- ')) {
            const listItemText = trimmedLine.substring(2).trim();

            // Ensure we're in a content div for the current header
            if (headerStack.length > 0 && !html.endsWith('</summary>\n') && !html.includes('<div class="content">')) {
                html += '<div class="content">\n';
            }

            if (indent > currentIndent || (!indent && !listStack.length)) {
                html += '<ul>\n';
                listStack.push(indent);
                currentIndent = indent;
            } else if (indent < currentIndent) {
                while (listStack.length > 0 && listStack[listStack.length - 1] > indent) {
                    html += '</ul>\n';
                    listStack.pop();
                }
                currentIndent = indent;
            }

            html += `<li>${processInlineFormatting(listItemText)}</li>\n`;
            continue;
        }

        // Handle regular paragraphs
        if (trimmedLine !== '') {
            // Ensure we're in a content div for the current header
            if (headerStack.length > 0 && !html.endsWith('</summary>\n') && !html.includes('<div class="content">')) {
                html += '<div class="content">\n';
            }

            // Close lists if we're not in a list context anymore
            if (listStack.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
                while (listStack.length > 0) {
                    html += '</ul>\n';
                    listStack.pop();
                }
                currentIndent = 0;
            }

            html += `<p>${processInlineFormatting(trimmedLine)}</p>\n`;
        }
    }

    // Close any remaining lists
    while (listStack.length > 0) {
        html += '</ul>\n';
        listStack.pop();
    }

    // Close all remaining headers with their content divs
    while (headerStack.length > 0) {
        html += '</div>\n</details>\n';
        headerStack.pop();
    }

    return html.trim();
}

function processInlineFormatting(text: string) {
    return text
        .replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')
        .replace(/(\*|_)(.*?)\1/g, '<em>$2</em>')
        .replace(/~~(.*?)~~/g, '<del>$1</del>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
}
/**
 * SolutionCard.js
 * 
 * Individual solution card component with icon, description,
 * feature list, and demo request CTA.
 */

/**
 * Renders a single solution card.
 * @param {Object} solution
 * @param {string} solution.icon - Emoji or SVG icon
 * @param {string} solution.title
 * @param {string} solution.description
 * @param {string[]} solution.features
 * @param {string} solution.id - Unique identifier
 * @returns {string}
 */
export function renderSolutionCard(solution) {
  const featuresHTML = solution.features
    .map(feature => `
      <div class="solution-card__feature">
        <span class="solution-card__feature-check">✓</span>
        <span>${feature}</span>
      </div>
    `)
    .join('');

  return `
    <div class="solution-card glass-card" data-solution-id="${solution.id}">
      <div class="solution-card__icon">${solution.icon}</div>
      <h3 class="solution-card__title">${solution.title}</h3>
      <p class="solution-card__description">${solution.description}</p>
      <div class="solution-card__features">
        ${featuresHTML}
      </div>
      <button class="button-primary solution-card__cta"
              data-demo-trigger="${solution.id}">
        Solicitar consulta
      </button>
    </div>
  `;
}

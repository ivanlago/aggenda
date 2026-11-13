function words(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z\s]/g, " ").split(/\s+/).filter(word => word && !["dr", "dra", "doutor", "doutora", "de", "da", "do", "dos", "das"].includes(word));
}

function distance(left: string, right: string) {
  const rows = Array.from({length:left.length+1},(_,i) => Array.from({length:right.length+1},(_,j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i=1;i<=left.length;i++) for (let j=1;j<=right.length;j++) {
    rows[i][j] = Math.min(rows[i-1][j]+1,rows[i][j-1]+1,rows[i-1][j-1]+Number(left[i-1]!==right[j-1]));
    if (i>1 && j>1 && left[i-1]===right[j-2] && left[i-2]===right[j-1]) rows[i][j]=Math.min(rows[i][j],rows[i-2][j-2]+1);
  }
  return rows[left.length][right.length];
}

// Only short name replies, against the professionals offered for this service.
export function professionalNameChoice<T extends {id:string;name:string}>(people:T[],text:string) {
  const input=words(text);
  if (!input.length || input.length>5 || /\d/.test(text)) return null;
  const unique=Array.from(new Map(people.map(person=>[person.id,person])).values());
  const exact=unique.filter(person => input.every(word=>words(person.name).includes(word)));
  if (exact.length) return {exact:true,candidates:exact};
  const candidates=unique.filter(person => {
    const target=words(person.name);
    return input.every(word=>target.some(part=>part===word || (part.length>=4 && word.length>=4 && distance(part,word)<=1)));
  });
  return candidates.length ? {exact:false,candidates} : null;
}

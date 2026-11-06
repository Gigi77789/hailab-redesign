// Lab culture page: a photo wall, filterable by kind.
// To add a photo: put the image in assets/culture/ (JPEG, about 1400px on the long side), then add a line to `photos`:
//   { src: "assets/culture/name.jpg", w: 1400, h: 1050, cat: "life", caption: "What is happening" }
// w and h are the image's pixel size (keeps the wall from jumping while photos load); cat is one of the keys in `kinds`.
// Only use photos everyone in them is happy to have online.
window.HAI_CULTURE = {
  kinds: [["conferences", "Conferences"], ["talks", "Talks and posters"], ["life", "Lab life"]],
  photos: [
    { src: "assets/culture/chi2025-yokohama.jpg", w: 1400, h: 1050, cat: "conferences", caption: "The lab at CHI 2025 in Yokohama" },
    { src: "assets/culture/pottery-finished-mugs.jpg", w: 1400, h: 1050, cat: "life", caption: "Mugs from our pottery night, glazed and fired" },
    { src: "assets/culture/chi2024-bingsheng-talk.jpg", w: 933, h: 1400, cat: "talks", caption: "Bingsheng presenting at CHI 2024 in Honolulu" },
    { src: "assets/culture/zongzi.jpg", w: 1400, h: 1050, cat: "life", caption: "Wrapping zongzi together for the Dragon Boat Festival" },
    { src: "assets/culture/emnlp2024-team.jpg", w: 1353, h: 1400, cat: "conferences", caption: "At EMNLP 2024 in Miami" },
    { src: "assets/culture/chi2024-turtles.jpg", w: 1400, h: 787, cat: "conferences", caption: "Sea turtle friends at CHI 2024" },
    { src: "assets/culture/emnlp2024-jiaju-poster.jpg", w: 1050, h: 1400, cat: "talks", caption: "Jiaju presenting StorySparkQA at EMNLP 2024" },
    { src: "assets/culture/yakitori-night.jpg", w: 1400, h: 1050, cat: "life", caption: "Yakitori night" },
    { src: "assets/culture/chi2024-reception.jpg", w: 1400, h: 933, cat: "conferences", caption: "An evening reception at CHI 2024" },
    { src: "assets/culture/mountain-trip.jpg", w: 1400, h: 1050, cat: "life", caption: "Out in the mountains during HCIC" },
    { src: "assets/culture/community-gathering.jpg", w: 1400, h: 1050, cat: "conferences", caption: "The crowd at Northeastern Night, CHI 2026 in Barcelona" },
    { src: "assets/culture/halloween.jpg", w: 1400, h: 1050, cat: "life", caption: "Halloween night out" },
    { src: "assets/culture/emnlp2024-poster-session.jpg", w: 1400, h: 1050, cat: "talks", caption: "Between posters at EMNLP 2024" },
    { src: "assets/culture/chi2024-lab-dinner.jpg", w: 1400, h: 1050, cat: "conferences", caption: "Lab dinner in Honolulu during CHI 2024" },
    { src: "assets/culture/pottery-drying.jpg", w: 1400, h: 1050, cat: "life", caption: "Freshly made mugs, waiting for the kiln" },
    { src: "assets/culture/reception-remarks.jpg", w: 1050, h: 1400, cat: "talks", caption: "Dakuo says a few words at Northeastern Night, CHI 2025 in Yokohama" },
    { src: "assets/culture/emnlp2024-dakuo-bingsheng.jpg", w: 1400, h: 1050, cat: "conferences", caption: "Dakuo and Bingsheng at EMNLP 2024" }
  ]
};

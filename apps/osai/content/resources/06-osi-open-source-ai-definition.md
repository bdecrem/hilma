---
title: The Open Source AI Definition (OSAID 1.0)
byline: Open Source Initiative, October 2024
url: https://opensource.org/ai/open-source-ai-definition
note: Full text of the definition, version 1.0.
---

## Preamble

### Why we need Open Source Artificial Intelligence (AI)

Open Source has demonstrated that massive benefits accrue to everyone after removing the barriers to learning, using, sharing and improving software systems. These benefits are the result of using licenses that adhere to the Open Source Definition. For AI, society needs at least the same essential freedoms of Open Source to enable AI developers, deployers and end users to enjoy those same benefits: autonomy, transparency, frictionless reuse and collaborative improvement.

## What is Open Source AI

When we refer to a “system,” we are speaking both broadly about a fully functional structure and its discrete structural elements. To be considered Open Source, the requirements are the same, whether applied to a **system**, a **model**, **weights and parameters**, or other structural elements.

An *Open Source AI* is an AI system made available under terms and in a way that grant the freedoms to:

- **Use** the system for any purpose and without having to ask for permission.

- **Study** how the system works and inspect its components.

- **Modify** the system for any purpose, including to change its output.

- **Share** the system for others to use with or without modifications, for any purpose.

These freedoms apply both to a fully functional system and to discrete elements of a system. A precondition to exercising these freedoms is to have access to the preferred form to make modifications to the system.

### Preferred form to make modifications to machine-learning systems

The preferred form of making modifications to a machine-learning system must include all the elements below:

- **Data Information:** Sufficiently detailed information about the data used to train the system so that a skilled person can build a substantially equivalent system. Data Information shall be made available under OSI-approved terms.

- In particular, this must include: (1) the complete description of all data used for training, including (if used) of unshareable data, disclosing the provenance of the data, its scope and characteristics, how the data was obtained and selected, the labeling procedures, and data processing and filtering methodologies; (2) a listing of all publicly available training data and where to obtain it; and (3) a listing of all training data obtainable from third parties and where to obtain it, including for fee.

- **Code:** The complete source code used to train and run the system. The Code shall represent the full specification of how the data was processed and filtered, and how the training was done. Code shall be made available under OSI-approved licenses.

- For example, if used, this must include code used for processing and filtering data, code used for training including arguments and settings used, validation and testing, supporting libraries like tokenizers and hyperparameters search code, inference code, and model architecture.

- **Parameters:** The model parameters, such as weights or other configuration settings. Parameters shall be made available under OSI-approved terms.

- For example, this might include checkpoints from key intermediate stages of training as well as the final optimizer state.

The licensing or other terms applied to these elements and to any combination thereof may contain conditions that require any modified version to be released under the same terms as the original.

## Open Source models and Open Source weights

For machine learning systems,

- An **AI model** consists of the model architecture, model parameters (including weights) and inference code for running the model.

- **AI weights** are the set of learned parameters that overlay the model architecture to produce an output from a given input.

The preferred form to make modifications to machine learning systems also applies to these individual components. “Open Source models” and “Open Source weights” must include the data information and code used to derive those parameters.

The Open Source AI Definition does not require a specific legal mechanism for assuring that the model parameters are freely available to all. They may be free by their nature or a license or other legal instrument may be required to ensure their freedom. We expect this will become clearer over time, once the legal system has had more opportunity to address Open Source AI systems.

## Definitions

- AI system: An AI system is a machine-based system that, for explicit or implicit objectives, infers, from the input it receives, how to generate outputs such as predictions, content, recommendations, or decisions that can influence physical or virtual environments. Different AI systems vary in their levels of autonomy and adaptiveness after deployment.

- Machine learning: is a set of techniques that allows machines to improve their performance and usually generate models in an automated manner through exposure to training data, which can help identify patterns and regularities rather than through explicit instructions from a human. The process of improving a system’s performance using machine learning techniques is known as “training”.

- These freedoms are derived from the Free Software Definition.

- Recommendation of the Council on Artificial Intelligence OECD/LEGAL/0449, Organization for Economic and Co-operation Development (OECD), 2024

- Explanatory memorandum on the updated OECD definition of an AI system, OECD Artificial Intelligence Papers, No. 8, OECD Publishing, Paris
